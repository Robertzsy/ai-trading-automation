"""Key-free company fundamentals: the first usable provider wins, without merging.

AKShare/BaoStock calls run in a disposable process because several upstream
functions do not expose HTTP timeouts. A timed-out provider is terminated before
the next provider starts; abandoned requests cannot accumulate in daemon threads.
"""
from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
from datetime import date, datetime, timezone
from typing import Any, Callable, Mapping, Sequence

import requests

from engine.atomic_write import write_text_atomic
from engine.data.providers.base import coerce_float, resolve_symbol, to_iso_date
from engine.paths import APP_ROOT, runtime_dir

logger = logging.getLogger("ai-trading-automation.fundamentals")
CACHE_DIR = runtime_dir() / "data" / "fundamentals-v1"
SCHEMA_VERSION = 1
POLICY = "primary-then-fallback-v1"
PROVIDERS = {
    "cn": ("akshare:em", "akshare:sina", "baostock"),
    "hk": ("akshare:em",),
    "us": ("sec:companyfacts", "akshare:em"),
}
_locks: dict[tuple[str, str], threading.Lock] = {}
_locks_guard = threading.Lock()

# Percent units stay percent points. BaoStock's fractional ratios are converted
# in its adapter; no downstream model is asked to guess or convert units.
_EM_FIELDS = {
    "revenue": ("currency", ("TOTALOPERATEREVE", "OPERATE_INCOME", "TOTAL_INCOME")),
    "net_income_parent": ("currency", ("PARENTNETPROFIT", "HOLDER_PROFIT", "PARENT_HOLDER_NETPROFIT")),
    "eps_basic": ("currency/share", ("EPSJB", "BASIC_EPS", "BASIC_EPS_CS")),
    "eps_ttm": ("currency/share", ("EPS_TTM",)),
    "cash_flow_operating_per_share": ("currency/share", ("MGJYXJJE", "PER_NETCASH_OPERATE")),
    "roe_pct": ("percent", ("ROEJQ", "ROE_AVG", "ROE")),
    "gross_margin_pct": ("percent", ("XSMLL", "GROSS_PROFIT_RATIO")),
    "net_margin_pct": ("percent", ("XSJLL", "NET_PROFIT_RATIO")),
    "debt_assets_pct": ("percent", ("ZCFZL", "DEBT_ASSET_RATIO", "DEBT_RATIO")),
    "current_ratio": ("ratio", ("LD", "CURRENT_RATIO")),
    "revenue_growth_yoy_pct": ("percent", ("TOTALOPERATEREVETZ", "OPERATE_INCOME_YOY", "TOTAL_INCOME_YOY")),
    "net_income_growth_yoy_pct": ("percent", ("PARENTNETPROFITTZ", "HOLDER_PROFIT_YOY", "PARENT_HOLDER_NETPROFIT_YOY")),
}
_SINA_FIELDS = {
    "revenue": ("currency", ("营业总收入", "营业收入")),
    "net_income_parent": ("currency", ("归母净利润", "归属于母公司股东的净利润")),
    "net_income": ("currency", ("净利润",)),
    "cash_flow_operating": ("currency", ("经营活动产生的现金流量净额", "经营现金流量净额")),
    "eps_basic": ("currency/share", ("基本每股收益", "基本每股收益(元)")),
    "roe_pct": ("percent", ("净资产收益率", "净资产收益率(%)", "加权净资产收益率")),
    "debt_assets_pct": ("percent", ("资产负债率", "资产负债率(%)")),
    "gross_margin_pct": ("percent", ("毛利率", "毛利率(%)")),
}


def _currency(value: Any) -> str | None:
    text = str(value or "").strip().upper()
    aliases = {"人民币": "CNY", "RMB": "CNY", "港元": "HKD", "港币": "HKD", "美元": "USD", "美金": "USD"}
    text = aliases.get(text, text)
    return text if re.fullmatch(r"[A-Z]{3}", text) else None


def _metric(value: Any, unit: str, field: str, currency: str | None, **extra: Any) -> dict | None:
    number = coerce_float(value)
    if number is None:
        return None
    if unit.startswith("currency"):
        if not currency:
            return None
        unit = unit.replace("currency", currency)
    return {"value": number, "unit": unit, "source_field": field, **extra}


def normalize_em(rows: Sequence[Mapping], market: str, symbol: str) -> list[dict]:
    records = []
    for row in rows:
        returned_symbol = row.get("SECURITY_CODE")
        if returned_symbol is not None:
            returned = str(returned_symbol).upper().replace("_", ".")
            if market == "hk":
                returned = returned.zfill(5)
            if returned != symbol.upper():
                raise ValueError("upstream returned a different stock")
        end = to_iso_date(row.get("REPORT_DATE") or row.get("STD_REPORT_DATE"))
        if not end:
            continue
        currency = "CNY" if market == "cn" else _currency(row.get("CURRENCY") or row.get("CURRENCY_NAME"))
        if market == "cn":
            kind = "annual" if end.endswith("12-31") else "ytd"
        elif market == "us":
            kind = "quarter"  # the US adapter explicitly requests 单季报
        else:
            kind = "annual" if str(row.get("DATE_TYPE_CODE")) == "001" else "unknown"
        url = (f"https://emweb.securities.eastmoney.com/PC_HKF10/NewFinancialAnalysis/index?type=web&code={symbol}"
               if market == "hk" else f"https://emweb.eastmoney.com/PC_USF10/pages/index.html?code={symbol}"
               if market == "us" else f"https://emweb.securities.eastmoney.com/pc_hsf10/pages/index.html?type=web&code={resolve_symbol(symbol).code.upper()}")
        metrics = {}
        for name, (unit, fields) in _EM_FIELDS.items():
            for field in fields:
                metric = _metric(row.get(field), unit, field, currency,
                                 **({"period_type": "ttm"} if name.endswith("_ttm") else {}))
                if metric is not None:
                    metrics[name] = metric
                    break
        records.append({"period_end": end, "period_start": to_iso_date(row.get("START_DATE")),
                        "period_type": kind, "disclosed_at": to_iso_date(row.get("NOTICE_DATE")),
                        "currency": currency, "source_url": url, "metrics": metrics})
    return records


def normalize_sina(rows: Sequence[Mapping], symbol: str) -> list[dict]:
    # stock_financial_abstract returns metrics down rows and report dates across columns.
    reports: dict[str, dict] = {}
    for row in rows:
        field = str(row.get("指标", ""))
        for name, (unit, fields) in _SINA_FIELDS.items():
            if field not in fields:
                continue
            for column, value in row.items():
                end = to_iso_date(column)
                metric = _metric(value, unit, field, "CNY") if end else None
                if metric is not None:
                    reports.setdefault(end, {})[name] = metric
    return [{"period_end": end, "period_start": None,
             "period_type": "annual" if end.endswith("12-31") else "ytd", "disclosed_at": None,
             "currency": "CNY", "source_url": f"https://vip.stock.finance.sina.com.cn/corp/go.php/vFD_FinanceSummary/stockid/{symbol}.phtml",
             "metrics": metrics} for end, metrics in reports.items()]


def normalize_baostock(rows: Sequence[Mapping]) -> list[dict]:
    records = []
    for row in rows:
        end = to_iso_date(row.get("statDate"))
        if not end:
            continue
        metrics = {}
        for name, field, unit in (("revenue", "MBRevenue", "currency"), ("net_income", "netProfit", "currency"),
                                  ("eps_ttm", "epsTTM", "currency/share"), ("roe_pct", "roeAvg", "percent"),
                                  ("net_margin_pct", "npMargin", "percent"), ("gross_margin_pct", "gpMargin", "percent")):
            metric = _metric(row.get(field), unit, field, "CNY")
            if metric is not None:
                if unit == "percent":
                    metric["value"] *= 100  # e.g. 官方示例 roeAvg=0.074617 -> 7.4617%
                if name.endswith("_ttm"):
                    metric["period_type"] = "ttm"
                metrics[name] = metric
        records.append({"period_end": end, "period_start": None,
                        "period_type": "annual" if end.endswith("12-31") else "ytd",
                        "disclosed_at": to_iso_date(row.get("pubDate")), "currency": "CNY",
                        "source_url": "https://www.baostock.com/mainContent?file=seasonProfit.md", "metrics": metrics})
    return records


_SEC_TAGS = {
    "revenue": ("RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "Revenue"),
    "net_income": ("NetIncomeLoss", "ProfitLoss"),
    "cash_flow_operating": ("NetCashProvidedByUsedInOperatingActivities", "CashFlowsFromUsedInOperatingActivities"),
    "assets": ("Assets",), "liabilities": ("Liabilities",),
    "equity": ("StockholdersEquity", "Equity"),
    "eps_basic": ("EarningsPerShareBasic", "BasicEarningsLossPerShare"),
}


def normalize_sec(payload: Mapping, cik: int, today: date) -> list[dict]:
    """Keep accession, period, currency and filing date together; avoid look-ahead.

    Instant balance-sheet facts join only the *same accession/end/currency* as
    income facts. Quarter and YTD durations remain distinct. Later restatements
    win for the same period, but future filings are never used.
    """
    durations: dict[tuple, dict] = {}
    instants: dict[tuple, dict] = {}
    facts = payload.get("facts", {})
    for name, tags in _SEC_TAGS.items():
        for taxonomy in ("us-gaap", "ifrs-full"):
            for tag in tags:
                for unit, values in facts.get(taxonomy, {}).get(tag, {}).get("units", {}).items():
                    currency = _currency(unit.split("/")[0])
                    if not currency or (name == "eps_basic" and not unit.endswith("/shares")) or (name != "eps_basic" and "/" in unit):
                        continue
                    for fact in values:
                        end, filed = to_iso_date(fact.get("end")), to_iso_date(fact.get("filed"))
                        start = to_iso_date(fact.get("start"))
                        accession = str(fact.get("accn", ""))
                        if not end or not filed or not accession or filed > today.isoformat() or end > today.isoformat():
                            continue
                        if fact.get("form") not in ("10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A"):
                            continue
                        if start:
                            days = (date.fromisoformat(end) - date.fromisoformat(start)).days
                            kind = "annual" if 300 <= days <= 400 else "quarter" if 60 <= days <= 120 else "ytd" if 120 < days < 300 else "unknown"
                            group = durations.setdefault((accession, end, start, currency), {
                                "period_end": end, "period_start": start, "period_type": kind, "disclosed_at": filed,
                                "currency": currency, "source_url": f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace('-', '')}/",
                                "accession": accession, "metrics": {},
                            })
                        else:
                            group = instants.setdefault((accession, end, currency), {"metrics": {}})
                        metric = _metric(fact.get("val"), "currency/share" if name == "eps_basic" else "currency", f"{taxonomy}:{tag}", currency)
                        if metric is not None:
                            group["metrics"].setdefault(name, metric)
    selected = {}
    for (accession, end, start, currency), record in durations.items():
        if not ("revenue" in record["metrics"] or "net_income" in record["metrics"]):
            continue
        record["metrics"].update(instants.get((accession, end, currency), {}).get("metrics", {}))
        key = (end, start, currency)
        if key not in selected or record["disclosed_at"] > selected[key]["disclosed_at"]:
            selected[key] = record
    return list(selected.values())


def _fetch_sec(symbol: str) -> list[dict]:
    # Public EDGAR data requires a declared app identity, not an account token.
    identity = os.getenv("IA_SEC_USER_AGENT", "").strip() or "AiTradingAutomation/2.1 (https://github.com/Robertzsy/ai-trading-automation)"
    headers = {"User-Agent": identity}
    tickers = requests.get("https://www.sec.gov/files/company_tickers.json", headers=headers, timeout=(5, 15))
    tickers.raise_for_status()
    match = next((row for row in tickers.json().values() if str(row.get("ticker", "")).upper().replace("-", ".") == symbol.replace("-", ".")), None)
    if match is None:
        raise ValueError("SEC ticker registry has no matching company")
    cik = int(match["cik_str"])
    response = requests.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json", headers=headers, timeout=(5, 20))
    response.raise_for_status()
    return normalize_sec(response.json(), cik, date.today())


def _fetch_provider(provider: str, market: str, symbol: str) -> list[dict]:
    if provider == "sec:companyfacts":
        return _fetch_sec(symbol)
    if provider == "baostock":
        import baostock as bs

        result = bs.login()  # anonymous public node; no new user credential
        if result.error_code != "0":
            raise RuntimeError("BaoStock anonymous login failed")
        rows = []
        try:
            today = date.today()
            index = today.year * 4 + (today.month - 1) // 3
            code = resolve_symbol(symbol).code
            code = code[:2] + "." + code[2:]
            # Only this selected tier is called. Stop at the latest published
            # report; do not fan out all ratio endpoints or backfill other tiers.
            for offset in range(1, 6):
                year, quarter = divmod(index - offset, 4)
                result = bs.query_profit_data(code=code, year=year, quarter=quarter + 1)
                if result.error_code != "0":
                    raise RuntimeError("BaoStock profit query failed: " + str(result.error_msg)[:150])
                while result.next():
                    rows.append(dict(zip(result.fields, result.get_row_data())))
                if rows:
                    break
        finally:
            bs.logout()
        return normalize_baostock(rows)
    import akshare as ak

    if provider == "akshare:sina":
        return normalize_sina(ak.stock_financial_abstract(symbol=symbol).to_dict("records"), symbol)
    if market == "cn":
        ref = resolve_symbol(symbol)
        code = ref.code[2:] + "." + ref.code[:2].upper()
        frame = ak.stock_financial_analysis_indicator_em(symbol=code, indicator="按报告期")
    elif market == "hk":
        frame = ak.stock_financial_hk_analysis_indicator_em(symbol=symbol, indicator="报告期")
    else:
        frame = ak.stock_financial_us_analysis_indicator_em(symbol=symbol.replace(".", "_"), indicator="单季报")
    return normalize_em(frame.to_dict("records"), market, symbol)


def _run_provider(provider: str, market: str, symbol: str, timeout: float) -> list[dict]:
    try:
        result = subprocess.run([sys.executable, "-m", "engine.data.fundamentals", "--worker", provider, market, symbol],
                                cwd=APP_ROOT, capture_output=True, encoding="utf-8", errors="replace", timeout=timeout,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError(f"provider exceeded {timeout:.1f}s; worker terminated") from exc
    # Do not copy provider stderr into model output: it may contain request or
    # environment diagnostics. The worker returns only a sanitized error code.
    if result.returncode:
        raise RuntimeError(f"provider worker failed (exit {result.returncode})")
    payload = json.loads(result.stdout)
    if payload.get("error"):
        raise RuntimeError(payload["error"])
    return payload["records"]


def select_provider(market: str, symbol: str, *, timeout: float = 45,
                    loader: Callable = _run_provider, today: date | None = None) -> dict:
    today = today or date.today()
    tiers = PROVIDERS[market]
    packet = {"schema_version": SCHEMA_VERSION, "policy": POLICY, "market": market, "symbol": symbol,
              "primary_provider": tiers[0], "provider": None, "degraded": False, "status": "unavailable",
              "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "records": [], "attempts": [], "gaps": []}
    deadline = time.monotonic() + timeout
    for index, provider in enumerate(tiers):
        started = time.monotonic()
        try:
            remaining = deadline - started
            if remaining <= 0:
                raise TimeoutError("total fetch deadline exhausted")
            records = loader(provider, market, symbol, remaining / (len(tiers) - index))
            records = [row for row in records if row.get("period_end") and row["period_end"] <= today.isoformat()
                       and (not row.get("disclosed_at") or row["disclosed_at"] <= today.isoformat())]
            records.sort(key=lambda row: (row["period_end"], row.get("disclosed_at") or "", len(row.get("metrics", {}))), reverse=True)
            if not records:
                raise ValueError("empty or undated financial report")
            latest = records[0]
            limit = 550 if latest.get("period_type") == "annual" else 300
            if (today - date.fromisoformat(latest["period_end"])).days > limit:
                raise ValueError("financial report is stale")
            metrics = latest.get("metrics", {})
            if not latest.get("currency") or "revenue" not in metrics or not ({"net_income", "net_income_parent"} & metrics.keys()):
                raise ValueError("required revenue/profit/currency fields are missing")
            for metric in metrics.values():
                if not isinstance(metric, Mapping) or coerce_float(metric.get("value")) is None or not metric.get("unit"):
                    raise ValueError("financial metric has an invalid number or unit")
            # Stop immediately. Optional ratios being absent never activate a
            # backup, and no values from rejected providers are retained.
            packet.update(provider=provider, degraded=index > 0, status="ok", records=records[:12], latest_report_date=latest["period_end"])
            for field in ("roe_pct", "debt_assets_pct", "cash_flow_operating", "eps_basic"):
                if field not in metrics:
                    packet["gaps"].append("optional metric unavailable: " + field)
            if latest.get("disclosed_at") is None:
                packet["gaps"].append("upstream did not provide a disclosure date")
            packet["attempts"].append({"provider": provider, "status": "selected", "elapsed_ms": round((time.monotonic() - started) * 1000)})
            break
        except Exception as exc:
            packet["attempts"].append({"provider": provider, "status": "failed", "reason": str(exc)[:240],
                                       "elapsed_ms": round((time.monotonic() - started) * 1000)})
    if packet["status"] != "ok":
        packet.update(unavailable=True, error="all configured financial providers failed")
        packet["gaps"].append("company fundamentals unavailable; do not infer missing values")
    facts = {key: packet[key] for key in ("market", "symbol", "provider", "status", "records", "gaps")}
    packet["data_version"] = hashlib.sha256(json.dumps(facts, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:20]
    return packet


def fetch_fundamentals(market: str, symbol: str, *, ttl_minutes: int = 360, timeout: float = 45) -> dict:
    raw = str(symbol).strip().upper()
    if re.fullmatch(r"\d{6}\.(SH|SZ|BJ)", raw):
        raw = raw[-2:] + raw[:6]
    ref = resolve_symbol(raw, market=market)
    normalized = ref.code[2:] if ref.market == "cn" else ref.code
    if ref.is_etf:
        return {"schema_version": SCHEMA_VERSION, "policy": POLICY, "market": "etf", "symbol": normalized,
                "status": "not_applicable", "provider": None, "records": [], "attempts": [],
                "gaps": ["ETF is a fund, not a company; company revenue/profit are not applicable"], "cached": False}
    key = (ref.market, normalized)
    with _locks_guard:
        lock = _locks.setdefault(key, threading.Lock())
    path = CACHE_DIR / ref.market / f"{normalized}.json"
    with lock:
        try:
            cached = json.loads(path.read_text(encoding="utf-8"))
            fetched = datetime.fromisoformat(cached["fetched_at"])
            age = (datetime.now(timezone.utc) - fetched).total_seconds()
            ttl = max(1, ttl_minutes) * 60 if cached.get("status") == "ok" else 30
            if (cached.get("schema_version") == SCHEMA_VERSION and cached.get("policy") == POLICY
                    and (cached.get("market"), cached.get("symbol")) == key and 0 <= age < ttl):
                return {**cached, "cached": True}
        except (OSError, ValueError, KeyError, TypeError):
            pass
        packet = select_provider(ref.market, normalized, timeout=timeout)
        packet["cached"] = False
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            write_text_atomic(path, json.dumps(packet, ensure_ascii=False, indent=2, allow_nan=False))
        except OSError:
            logger.warning("fundamentals cache write failed for %s/%s", *key)
        logger.info("fundamentals market=%s symbol=%s status=%s provider=%s degraded=%s attempts=%s",
                    *key, packet["status"], packet["provider"], packet["degraded"], len(packet["attempts"]))
        return packet


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        with contextlib.redirect_stdout(sys.stderr):
            records = _fetch_provider(*sys.argv[2:5])
        print(json.dumps({"records": records}, ensure_ascii=False, allow_nan=False))
    except Exception as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        suffix = f" (HTTP {status})" if status else ""
        print(json.dumps({"error": type(exc).__name__ + ": financial data request failed" + suffix}))

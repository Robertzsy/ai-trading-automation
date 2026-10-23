"""Low-frequency fallback quotes that fill snapshot gaps.

Two optional, keyed sources supplement the Node/Tencent snapshot path:

* **妙想 (EastMoney MX skills)** – natural-language query endpoint. One request
  per symbol returns the latest close/change/amount/PE. Requires ``MX_APIKEY``.
* **Tushare Pro** – one request per market per trading day returns the whole
  market's ``amount``/``pe_ttm`` (CN) or ``amount`` (HK). The free tier is
  rate-limited (roughly 1 request/minute), so the result is cached per day in
  ``runtime/data`` and reused by every subsequent snapshot.

Nothing here is required for the engine to run: a missing key, quota or network
error simply leaves the original snapshot untouched and records the gap.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from engine import paths

MX_QUERY_URL = "https://mkapi2.dfcfs.com/finskillshub/api/claw/query"
MX_SCREEN_URL = "https://mkapi2.dfcfs.com/finskillshub/api/claw/stock-screen"
TUSHARE_URL = "http://api.tushare.pro"

_MX_TIMEOUT = 25
_TS_TIMEOUT = 40


def _post_json(url: str, payload: Dict[str, Any], headers: Optional[Dict[str, str]] = None, timeout: int = 25) -> Dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json; charset=utf-8", **(headers or {})},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _number(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "")
    if not text or text in {"-", "--", "null", "None"}:
        return None
    match = re.match(r"^-?\d+(?:\.\d+)?", text)
    return float(match.group(0)) if match else None


def _money(value: Any) -> Optional[float]:
    """Parse display strings such as "27.23亿" / "5075.5万" into base units."""
    number = _number(value)
    if number is None:
        return None
    text = str(value)
    if "万亿" in text:
        return number * 1e12
    if "亿" in text:
        return number * 1e8
    if "万" in text:
        return number * 1e4
    return number


def infer_market(symbol: str) -> str:
    text = str(symbol or "").strip().lower()
    if text.startswith("us"):
        return "us"
    if text.startswith("hk"):
        return "hk"
    text = re.sub(r"^(sh|sz|bj)", "", text)
    if re.fullmatch(r"\d{5}", text):
        return "hk"
    if re.fullmatch(r"\d{6}", text):
        return "cn"
    if re.fullmatch(r"[a-z][a-z.\-]{0,6}", text):
        return "us"
    return "cn"


def _ts_code(symbol: str, market: str) -> str:
    text = re.sub(r"^(hk|us|sh|sz|bj)", "", str(symbol or "").strip(), flags=re.IGNORECASE)
    if market == "hk":
        return text.zfill(5) + ".HK"
    if market == "us":
        return text.upper()
    if market == "etf":
        return text + (".SH" if text.startswith(("5", "6")) else ".SZ")
    if text.startswith(("6", "9")):
        return text + ".SH"
    if text.startswith(("4", "8", "92")):
        return text + ".BJ"
    return text + ".SZ"


def _mx_key() -> str:
    return (os.getenv("MX_APIKEY") or "").strip()


def _tushare_key() -> str:
    return (os.getenv("TUSHARE_TOKEN") or "").strip()


# ── 妙想 ────────────────────────────────────────────────────────────────
def mx_quote(symbol: str, name: str = "") -> Optional[Dict[str, Any]]:
    """One natural-language query for one symbol; returns normalised fields."""
    key = _mx_key()
    if not key:
        return None
    label = (name or symbol).strip()
    question = f"{label} 最新价 涨跌幅 成交额 市盈率"
    try:
        payload = _post_json(MX_QUERY_URL, {"toolQuery": question}, {"apikey": key}, _MX_TIMEOUT)
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None
    if payload.get("status") not in (0, "0"):
        return None
    result = ((payload.get("data") or {}).get("data") or {}).get("searchDataResultDTO") or {}
    tables = result.get("dataTableDTOList") or []
    for table in tables:
        raw = table.get("rawTable") or {}
        names = table.get("nameMap") or {}
        order = table.get("indicatorOrder") or list(raw.keys())
        fields: Dict[str, Any] = {}
        for field_id in order:
            label_text = str(names.get(field_id, "")) if isinstance(names, dict) else ""
            values = raw.get(field_id)
            first = values[0] if isinstance(values, list) and values else None
            if "成交额" in label_text:
                fields["amount"] = _number(first)
            elif "收盘价" in label_text or "最新价" in label_text:
                fields["price"] = _number(first)
            elif "涨跌幅" in label_text:
                fields["change_pct"] = _number(first)
            elif "市盈率" in label_text:
                fields["pe_ttm"] = _number(first)
        if fields:
            fields["source"] = "miaoxiang"
            fields["code"] = str(table.get("code") or "")
            return fields
    return None


def mx_screen(keyword: str) -> Optional[List[Dict[str, Any]]]:
    """Natural-language screening. Returns [] for an empty result, None on failure."""
    key = _mx_key()
    if not key or not str(keyword or "").strip():
        return None
    try:
        payload = _post_json(MX_SCREEN_URL, {"keyword": str(keyword).strip()}, {"apikey": key}, 45)
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None
    if payload.get("status") not in (0, "0"):
        return None
    data = ((payload.get("data") or {}).get("data") or {})
    result = ((data.get("allResults") or {}).get("result") or {})
    rows = result.get("dataList") or []
    columns = result.get("columns") or []
    keys = {str(col.get("key")): str(col.get("title")) for col in columns if isinstance(col, dict)}
    out: List[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        code = str(row.get("SECURITY_CODE") or "").strip()
        if not code:
            continue
        item = {
            "symbol": code,
            "name": str(row.get("SECURITY_SHORT_NAME") or "").strip(),
            "price": _number(row.get("NEWEST_PRICE")),
            "change_pct": _number(row.get("CHG")),
            "source": "miaoxiang",
        }
        for key_name, title in keys.items():
            value = row.get(key_name)
            if value is None:
                continue
            if "成交额" in title:
                item["amount"] = _money(value)
            elif "市盈率" in title:
                item["pe_ttm"] = _number(value)
            elif "总市值" in title:
                item["market_cap"] = _money(value)
        out.append(item)
    return out


# ── Tushare（每天一次，缓存）────────────────────────────────────────────
def _cache_path(market: str, trade_date: str) -> Path:
    return paths.runtime_dir() / "data" / f"tushare-{market}-{trade_date}.json"


def _read_cache(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _write_cache(path: Path, payload: Dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def _tushare(api_name: str, params: Dict[str, Any], fields: str) -> Optional[Dict[str, Any]]:
    key = _tushare_key()
    if not key:
        return None
    try:
        payload = _post_json(
            TUSHARE_URL,
            {"api_name": api_name, "token": key, "params": params, "fields": fields},
            timeout=_TS_TIMEOUT,
        )
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None
    if payload.get("code") not in (0, "0"):
        return None
    return payload.get("data") or {}


def _last_weekday() -> str:
    day = date.today()
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day.strftime("%Y%m%d")


def tushare_snapshot(market: str) -> Dict[str, Dict[str, Any]]:
    """Return {symbol: {amount, pe_ttm?}} for the latest weekday.

    The free token allows roughly one request per minute per interface, so this
    performs at most ONE request per market and caches the result (including an
    empty result) for that day. A rate-limit/quota error returns the cache if
    any, else {}.
    """
    if market not in {"cn", "hk", "etf"}:
        return {}
    day = _last_weekday()
    path = _cache_path(market, day)
    cached = _read_cache(path)
    if cached is not None:
        return cached
    if market in {"cn", "etf"}:
        data = _tushare("daily_basic", {"trade_date": day}, "ts_code,close,pe_ttm,total_mv,amount,turnover_rate")
    else:
        data = _tushare("hk_daily", {"trade_date": day}, "ts_code,close,amount")
    items = data.get("items") if data else None
    fields = data.get("fields") if data else None
    if not items or not fields:
        _write_cache(path, {})
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    for row in items:
        record = dict(zip(fields, row))
        code = str(record.get("ts_code") or "").upper()
        if not code:
            continue
        symbol = code.split(".")[0]
        if market == "hk":
            symbol = symbol.zfill(5)
        entry: Dict[str, Any] = {"source": "tushare"}
        amount = _number(record.get("amount"))
        if amount is not None:
            # daily_basic.amount is in 千元; hk_daily.amount is in 港元.
            entry["amount"] = amount * 1000 if market in {"cn", "etf"} else amount
        pe = _number(record.get("pe_ttm"))
        if pe is not None:
            entry["pe_ttm"] = pe
        mv = _number(record.get("total_mv"))
        if mv is not None:
            entry["market_cap"] = mv * 1000 if market in {"cn", "etf"} else mv
        out[symbol] = entry
    _write_cache(path, out)
    return out


# ── enrichment ──────────────────────────────────────────────────────────
def _history_high_low(history: Iterable[Dict[str, Any]]) -> Tuple[Optional[float], Optional[float]]:
    highs: List[float] = []
    lows: List[float] = []
    for row in history or []:
        high = _number(row.get("high"))
        low = _number(row.get("low"))
        if high is not None:
            highs.append(high)
        if low is not None and low > 0:
            lows.append(low)
    if not highs or not lows:
        return None, None
    return max(highs), min(lows)


def _record_data_quality(
    symbol: str,
    market: str,
    initial_gaps: List[str],
    remaining_gaps: List[str],
    sources: List[str],
) -> None:
    """Append one observation to the data-quality log (best effort).

    The feedback loop reads this log to compute the snapshot gap rate, which is
    the metric behind "把因数据缺失导致的无效 HOLD 降到 0".
    """
    try:
        directory = paths.runtime_dir() / "opt-feedback"
        directory.mkdir(parents=True, exist_ok=True)
        entry = {
            "at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "symbol": str(symbol),
            "market": str(market),
            "initial_gaps": list(initial_gaps),
            "remaining_gaps": list(remaining_gaps),
            "sources": list(sources),
            "filled": bool(sources),
        }
        with (directory / "data-quality.jsonl").open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        return


def enrich_snapshot(symbol: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Fill realtime.amount / pe and repair the 52-week fields in place."""
    realtime = payload.get("realtime")
    if not isinstance(realtime, dict):
        return payload
    market = str(realtime.get("market") or infer_market(symbol)).lower()
    sources: List[str] = []
    gaps: List[str] = []

    # 52-week high/low and amplitude are derivable from the history already in
    # the payload, so repair them before asking any network source.
    high_52w, low_52w = _history_high_low(payload.get("history") or [])
    if high_52w is not None:
        realtime["high_52w"] = high_52w
    if low_52w is not None:
        realtime["low_52w"] = low_52w
    prev_close = _number(realtime.get("prev_close")) or _number(realtime.get("price"))
    day_high = _number(realtime.get("high"))
    day_low = _number(realtime.get("low"))
    if prev_close and day_high is not None and day_low is not None and prev_close > 0:
        realtime["amplitude"] = round((day_high - day_low) / prev_close * 100, 3)

    # The Node/Tencent snapshot reports A-share turnover in 万元; normalise to
    # the base unit (元 / 港元) so downstream thresholds compare like with like.
    amount = _number(realtime.get("amount"))
    if amount:
        amount = amount * 10000
    pe = _number(realtime.get("pe"))
    initial_gaps = [name for name, value in (("amount", amount), ("pe", pe)) if not value]

    code = re.sub(r"^(hk|us|sh|sz|bj)", "", str(realtime.get("code") or ""), flags=re.IGNORECASE)
    key = code.zfill(5) if market == "hk" else code
    daily = tushare_snapshot(market)
    entry = daily.get(key) or {}
    if not amount and entry.get("amount"):
        amount = entry["amount"]
        sources.append("tushare")
    if not pe and entry.get("pe_ttm"):
        pe = entry["pe_ttm"]
        sources.append("tushare")
    if not amount or not pe:
        quote = mx_quote(symbol, str(realtime.get("name") or ""))
        if quote:
            if not amount and quote.get("amount"):
                amount = quote["amount"]
                sources.append("miaoxiang")
            if not pe and quote.get("pe_ttm"):
                pe = quote["pe_ttm"]
                sources.append("miaoxiang")

    realtime["amount"] = amount if amount else None
    if not amount:
        gaps.append("amount")
    if pe:
        realtime["pe"] = pe
    else:
        gaps.append("pe")
    payload["data_sources"] = sorted(set(sources))
    payload["data_gaps"] = gaps
    _record_data_quality(symbol, market, initial_gaps, gaps, sorted(set(sources)))
    return payload

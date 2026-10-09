from concurrent.futures import ThreadPoolExecutor
from datetime import date
import json
import subprocess
import time

import pytest

from engine.data import fundamentals as f

TODAY = date(2026, 10, 9)


def report(**changes):
    return {"period_end": "2026-06-30", "period_start": None, "period_type": "ytd", "currency": "CNY",
            "disclosed_at": "2026-08-20", "source_url": "https://example.com/report", "metrics": {
                "revenue": {"value": 100, "unit": "CNY"}, "net_income": {"value": -5, "unit": "CNY"}}, **changes}


def test_primary_success_never_contacts_backups_even_when_optional_metrics_are_missing():
    calls = []
    def load(provider, *args):
        calls.append(provider)
        if provider != "akshare:em":
            pytest.fail("healthy primary must not contact a backup")
        return [report()]
    result = f.select_provider("cn", "600519", loader=load, today=TODAY)
    assert calls == ["akshare:em"]
    assert result["status"] == "ok" and result["degraded"] is False
    assert result["records"][0]["metrics"]["net_income"]["value"] == -5
    assert any("roe_pct" in gap for gap in result["gaps"])


@pytest.mark.parametrize("bad", [[], [report(metrics={"revenue": {"value": 100, "unit": "CNY"}})],
                               [report(period_end="2024-01-01")], [report(period_end="2027-01-01")]])
def test_unusable_primary_switches_once_without_merging_partial_metrics(bad):
    calls = []
    def load(provider, *args):
        calls.append(provider)
        return bad if provider == "akshare:em" else [report()]
    result = f.select_provider("cn", "600519", loader=load, today=TODAY)
    assert calls == ["akshare:em", "akshare:sina"]
    assert result["provider"] == "akshare:sina" and result["degraded"]
    assert result["records"] == [report()]
    assert result["attempts"][0]["status"] == "failed"


def test_timeout_switches_in_order_and_all_failures_remain_explicit():
    calls = []
    def load(provider, *args):
        calls.append(provider)
        raise TimeoutError("offline")
    result = f.select_provider("cn", "600519", loader=load, today=TODAY)
    assert calls == list(f.PROVIDERS["cn"])
    assert result["records"] == [] and result["unavailable"]


def test_baostock_preserves_yuan_and_converts_fractional_ratios():
    row = f.normalize_baostock([{"statDate": "20260630", "pubDate": "2026-08-20", "MBRevenue": "83354000000",
                                "netProfit": "28522000000", "roeAvg": "0.074617", "epsTTM": "1.939029"}])[0]
    assert row["metrics"]["revenue"]["value"] == 83354000000
    assert row["metrics"]["revenue"]["unit"] == "CNY"
    assert row["metrics"]["roe_pct"]["value"] == pytest.approx(7.4617)
    assert row["metrics"]["eps_ttm"]["period_type"] == "ttm"


def test_hk_currency_and_per_share_cashflow_are_not_guessed():
    row = f.normalize_em([{"REPORT_DATE": "2026-06-30", "CURRENCY": "人民币", "OPERATE_INCOME": 100,
                          "HOLDER_PROFIT": 20, "PER_NETCASH_OPERATE": 4}], "hk", "00700")[0]
    assert row["currency"] == "CNY"
    assert row["metrics"]["cash_flow_operating_per_share"]["unit"] == "CNY/share"
    assert "cash_flow_operating" not in row["metrics"]
    assert row["period_type"] == "unknown" and row["disclosed_at"] is None
    bad = f.normalize_em([{"REPORT_DATE": "2026-06-30", "OPERATE_INCOME": 100}], "hk", "00700")[0]
    assert bad["metrics"] == {}


def test_sina_transposes_reports_and_does_not_turn_nan_into_zero():
    rows = [{"指标": "营业总收入", "20260630": 100, "20251231": 150},
            {"指标": "归母净利润", "20260630": -2, "20251231": float("nan")}]
    records = {row["period_end"]: row for row in f.normalize_sina(rows, "600519")}
    assert records["2026-06-30"]["metrics"]["net_income_parent"]["value"] == -2
    assert "net_income_parent" not in records["2025-12-31"]["metrics"]


def test_em_rejects_a_different_stock_and_nonfinite_core_data():
    with pytest.raises(ValueError, match="different stock"):
        f.normalize_em([{"SECURITY_CODE": "000001", "REPORT_DATE": "2026-06-30"}], "cn", "600519")
    result = f.select_provider("hk", "00700", today=TODAY, loader=lambda *args: [report(metrics={
        "revenue": {"value": float("nan"), "unit": "CNY"}, "net_income": {"value": 1, "unit": "CNY"}})])
    assert result["status"] == "unavailable"


def test_sec_keeps_periods_and_accessions_separate_and_excludes_future_filings():
    def fact(value, **extra):
        return {"val": value, "start": "2026-04-01", "end": "2026-06-30", "filed": "2026-08-01",
                "accn": "0001-26-00001", "form": "10-Q", **extra}
    payload = {"facts": {"us-gaap": {
        "Revenues": {"units": {"USD": [fact(100), fact(999, filed="2027-01-01", accn="future")]}},
        "NetIncomeLoss": {"units": {"USD": [fact(20), fact(50, start="2026-01-01")]}},
        "Assets": {"units": {"USD": [fact(500, start=None), fact(900, start=None, accn="other")]}},
    }}}
    records = f.normalize_sec(payload, 1, TODAY)
    quarterly = next(row for row in records if row["period_type"] == "quarter")
    assert quarterly["metrics"]["revenue"]["value"] == 100
    assert quarterly["metrics"]["assets"]["value"] == 500
    assert quarterly["currency"] == "USD"
    assert next(row for row in records if row["period_type"] == "ytd")["period_start"] == "2026-01-01"


def test_cache_coalesces_same_stock_reads_and_separates_different_stocks(monkeypatch, tmp_path):
    monkeypatch.setattr(f, "CACHE_DIR", tmp_path)
    calls, original = [], f.select_provider
    def select(market, symbol, **kwargs):
        calls.append(symbol)
        time.sleep(.02)
        return original(market, symbol, loader=lambda *args: [report()], today=TODAY)
    monkeypatch.setattr(f, "select_provider", select)
    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(lambda _: f.fetch_fundamentals("cn", "600519"), range(4)))
    assert calls == ["600519"]
    assert sum(row["cached"] for row in rows) == 3
    assert f.fetch_fundamentals("cn", "000001")["symbol"] == "000001"
    assert calls == ["600519", "000001"]
    saved = json.loads((tmp_path / "cn" / "600519.json").read_text(encoding="utf-8"))
    assert saved["data_version"] == rows[0]["data_version"]


def test_etf_does_not_fetch_company_fundamentals(monkeypatch):
    monkeypatch.setattr(f, "select_provider", lambda *args, **kwargs: pytest.fail("ETF must not call company providers"))
    assert f.fetch_fundamentals("etf", "510300")["status"] == "not_applicable"


def test_worker_timeout_is_bounded_before_fallback(monkeypatch):
    def timeout(*args, **kwargs):
        assert kwargs["timeout"] == 2
        raise subprocess.TimeoutExpired(args[0], 2)
    monkeypatch.setattr(subprocess, "run", timeout)
    with pytest.raises(TimeoutError, match="worker terminated"):
        f._run_provider("akshare:em", "cn", "600519", 2)

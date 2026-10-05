"""Tests for the K-line provider ladder (akshare primary, Node fallback).

The default suite is fully offline: every degradation path is driven through
fake akshare modules and fake Node runners.  The handful of tests that need a
live upstream are marked with ``@_live`` and are skipped unless
``IA_KLINE_LIVE=1`` is set, so CI never depends on a third-party quote site.
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Mapping, Sequence

import pytest

from engine.data import fetcher
from engine.data import providers
from engine.data.providers import akshare_provider, base, indicators, legacy_node_provider
from engine.data.providers.akshare_provider import AkshareProvider
from engine.data.providers.base import (
    AdjustedDataUnavailable,
    ProviderDataError,
    ProviderTimeout,
    ProviderUnavailable,
    ProvidersExhausted,
    SymbolNotSupported,
    resolve_symbol,
    to_fixed,
)
from engine.data.providers.legacy_node_provider import LegacyNodeProvider

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "stock-fetcher.js"

LIVE = os.environ.get("IA_KLINE_LIVE") == "1"
_live = pytest.mark.skipif(not LIVE, reason="需要真实网络：设置 IA_KLINE_LIVE=1 运行")


# ─── helpers ──────────────────────────────────────────────


def _node(call: str) -> Any:
    """Evaluate a tiny CommonJS snippet against the shipped Node fetcher."""

    proc = subprocess.run(
        ["node", "-e", call],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=str(ROOT),
    )
    return json.loads(proc.stdout)


def _js_detect(value: str) -> Dict[str, Any]:
    return _node(
        f"const {{detectMarket}} = require({json.dumps(str(SCRIPT))});"
        f"console.log(JSON.stringify(detectMarket({json.dumps(value)})));"
    )


def _js_to_fixed(value: float, digits: int) -> str:
    return _node(f"console.log(JSON.stringify(({value!r}).toFixed({digits})));")


def _lcg_bars(count: int, *, seed: int = 20240930, start: float = 100.0) -> List[Dict[str, Any]]:
    """Deterministic OHLCV series (integer volumes keep volume sums exact)."""

    state = seed
    bars: List[Dict[str, Any]] = []
    close = start
    day = 1
    month = 1
    year = 2020
    for index in range(count):
        state = (1103515245 * state + 12345) % (2**31)
        drift = ((state % 2000) - 1000) / 5000.0
        open_price = round(close, 2)
        close = round(max(1.0, close * (1 + drift / 100)), 2)
        high = round(max(open_price, close) * (1 + (state % 97) / 10000.0), 2)
        low = round(min(open_price, close) * (1 - (state % 89) / 10000.0), 2)
        volume = 1_000_000 + (state % 500_000)
        bars.append(
            {
                "date": f"{year:04d}-{month:02d}-{day:02d}",
                "open": open_price,
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
            }
        )
        day += 1
        if day > 28:
            day = 1
            month += 1
            if month > 12:
                month = 1
                year += 1
    assert len(bars) == count
    return bars


def _tencent_payload(bars: Sequence[Mapping[str, Any]], code: str = "sh600519") -> Dict[str, Any]:
    """Reproduce ``getTencentHistory()``'s JSON, key order included."""

    rows = [
        {"date": b["date"], "open": b["open"], "close": b["close"], "high": b["high"], "low": b["low"], "volume": b["volume"]}
        for b in bars
    ]
    return {"code": code, "count": len(rows), "data": rows}


def _sina_payload(bars: Sequence[Mapping[str, Any]], code: str = "sh600519") -> Dict[str, Any]:
    """Reproduce ``getSinaHistory()``'s JSON, key order included."""

    rows = [
        {"date": b["date"], "open": b["open"], "high": b["high"], "low": b["low"], "close": b["close"], "volume": b["volume"]}
        for b in bars
    ]
    return {"code": code, "count": len(rows), "data": rows}


class _Frame:
    """Minimal stand-in for the akshare return value (pandas DataFrame)."""

    def __init__(self, rows: Sequence[Mapping[str, Any]]) -> None:
        self._rows = [dict(row) for row in rows]

    def to_dict(self, orient: str = "records") -> List[Dict[str, Any]]:  # noqa: ARG002
        return [dict(row) for row in self._rows]


def _em_frame(count: int = 0) -> _Frame:
    bars = _lcg_bars(count or 320)
    return _Frame(
        [
            {
                "日期": b["date"],
                "股票代码": "600519",
                "开盘": b["open"],
                "收盘": b["close"],
                "最高": b["high"],
                "最低": b["low"],
                "成交量": b["volume"] // 100,
            }
            for b in bars
        ]
    )


def _sina_frame(count: int = 0) -> _Frame:
    bars = _lcg_bars(count or 320)
    return _Frame(
        [
            {
                "date": b["date"],
                "open": b["open"],
                "high": b["high"],
                "low": b["low"],
                "close": b["close"],
                "volume": b["volume"],
            }
            for b in bars
        ]
    )


class FakeAkshare:
    """Records calls; behaviour is scripted per function name."""

    def __init__(self, behaviours: Mapping[str, Any]) -> None:
        self.behaviours = dict(behaviours)
        self.calls: List[Dict[str, Any]] = []

    def _invoke(self, name: str, **kwargs: Any) -> Any:
        self.calls.append({"name": name, **kwargs})
        behaviour = self.behaviours.get(name)
        if behaviour is None:
            raise AssertionError(f"unexpected akshare call: {name}")
        if isinstance(behaviour, BaseException):
            raise behaviour
        if callable(behaviour):
            return behaviour(**kwargs)
        if isinstance(behaviour, Sequence) and behaviour and isinstance(behaviour[0], BaseException):
            index = len([c for c in self.calls if c["name"] == name]) - 1
            outcome = behaviour[min(index, len(behaviour) - 1)]
            if isinstance(outcome, BaseException):
                raise outcome
            return outcome
        return behaviour

    def __getattr__(self, name: str) -> Any:
        if name.startswith("_") or name in ("calls", "behaviours"):
            raise AttributeError(name)
        if name not in self.behaviours:
            raise AttributeError(name)
        return lambda **kwargs: self._invoke(name, **kwargs)


class _FailingTier:
    """A ladder tier that always fails, for offline degradation tests."""

    def __init__(self, name: str, message: str = "down") -> None:
        self.name = name
        self.message = message

    def supports(self, ref: Any) -> bool:  # noqa: ARG002
        return True

    def fetch(self, ref: Any, *, period: str = "day", deadline: float = 1.0, max_bars: int = 1024) -> Any:
        raise ProviderUnavailable(f"{self.name} {self.message}", source=self.name)


class _StaticTier:
    """A ladder tier that returns a canned payload."""

    name = "test:static"

    def __init__(self, payload: Mapping[str, Any]) -> None:
        self.payload = dict(payload)

    def supports(self, ref: Any) -> bool:  # noqa: ARG002
        return True

    def fetch(self, ref: Any, *, period: str = "day", deadline: float = 1.0, max_bars: int = 1024) -> Any:
        return dict(self.payload)


@pytest.fixture()
def offline_akshare(monkeypatch):
    """Force the akshare tier on with an injectable module."""

    def install(module: Any) -> Any:
        monkeypatch.setattr(akshare_provider, "_import_akshare", lambda: module)
        monkeypatch.setattr(akshare_provider, "_AKSHARE_AVAILABLE", True)
        return module

    return install


# ─── symbol resolution ────────────────────────────────────


def test_resolve_symbol_market_and_code_match_legacy_javascript():
    for value in ["sh600519", "600519", "000001", "sz000001", "hk00700", "00700", "usAAPL", "AAPL", "bj430047"]:
        expected = _js_detect(value)
        resolved = resolve_symbol(value)
        assert (resolved.market, resolved.code.lower()) == (expected["market"], expected["code"].lower()), value


def test_resolve_symbol_classifies_funds_as_etf():
    assert resolve_symbol("510300").instrument == "etf"
    assert resolve_symbol("sh510300").instrument == "etf"
    assert resolve_symbol("159915").instrument == "etf"
    assert resolve_symbol("600519").instrument == "stock"
    assert resolve_symbol("000001").instrument == "stock"
    assert resolve_symbol("hk00700").instrument == "stock"


def test_resolve_symbol_rejects_unknown_code():
    with pytest.raises(SymbolNotSupported):
        resolve_symbol("not a symbol !")
    with pytest.raises(SymbolNotSupported):
        resolve_symbol("")


# ─── normalization ────────────────────────────────────────


def test_to_fixed_matches_javascript_tofixed_including_ties():
    for value, digits in [(0.125, 2), (-0.125, 2), (2.675, 2), (1.005, 2), (1234.5678, 2), (-3.4567, 3)]:
        expected = float(_js_to_fixed(value, digits))
        assert to_fixed(value, digits) == expected, (value, digits)


def test_normalize_bars_accepts_east_money_columns_and_iso_dates():
    rows = [
        {"日期": "2024-01-03", "开盘": 1, "收盘": 2, "最高": 3, "最低": 0.5, "成交量": 10},
        {"日期": "20240104", "开盘": 2, "收盘": 2.5, "最高": 2.6, "最低": 1.9, "成交量": 20},
        {"日期": "2024/01/05", "开盘": 2.5, "收盘": 2.2, "最高": 2.7, "最低": 2.1, "成交量": 30},
    ]
    bars = base.normalize_bars(rows)
    assert [bar["date"] for bar in bars] == ["2024-01-03", "2024-01-04", "2024-01-05"]
    assert bars[-1]["close"] == 2.2
    assert bars[0]["volume"] == 10.0


def test_normalize_bars_accepts_sina_columns_and_drops_junk_rows():
    rows = [
        {"day": "2024-01-03", "open": "1.0", "high": "3", "low": "0.5", "close": "2", "volume": "10"},
        {"day": "", "close": "2"},
        {"day": "2024-01-04", "close": None},
        {"day": "2024-01-04", "open": "2", "high": "2.6", "low": "1.9", "close": "2.5", "volume": "20"},
        {"day": "2024-01-04", "open": "2", "high": "2.6", "low": "1.9", "close": "9.9", "volume": "20"},
    ]
    bars = base.normalize_bars(rows)
    assert [bar["date"] for bar in bars] == ["2024-01-03", "2024-01-04"]
    # duplicate dates keep the last occurrence (upstream revision wins)
    assert bars[-1]["close"] == 9.9


# ─── akshare provider ─────────────────────────────────────


def test_akshare_em_routing_per_market(offline_akshare):
    module = offline_akshare(
        FakeAkshare(
            {
                "stock_zh_a_hist": _em_frame(),
                "fund_etf_hist_em": _em_frame(),
                "stock_hk_hist": _em_frame(),
                "stock_us_hist": _em_frame(),
            }
        )
    )
    expected = {
        "sh600519": ("stock_zh_a_hist", "600519"),
        "sh510300": ("fund_etf_hist_em", "510300"),
        "hk00700": ("stock_hk_hist", "00700"),
        "usAAPL": ("stock_us_hist", "105.AAPL"),
    }
    for symbol, (function_name, expected_symbol) in expected.items():
        ref = resolve_symbol(symbol)
        provider = AkshareProvider("em", akshare_module=module)
        payload = provider.fetch(ref, deadline=5.0)
        call = module.calls[-1]
        assert call["name"] == function_name, symbol
        assert call["symbol"] == expected_symbol, symbol
        assert call["adjust"] == "qfq"
        assert call["period"] == "daily"
        assert payload["source"] == "akshare:em"
        assert payload["adjusted"] is True
        assert payload["count"] > 0
        assert payload["data"][0]["date"].count("-") == 2


def test_akshare_us_hist_tries_each_east_money_secid_prefix(offline_akshare):
    attempts = {"count": 0}

    def us_hist(**kwargs: Any) -> _Frame:
        attempts["count"] += 1
        if kwargs["symbol"] != "107.AAPL":
            raise TypeError("'NoneType' object is not subscriptable")
        return _em_frame()

    module = offline_akshare(FakeAkshare({"stock_us_hist": us_hist}))
    payload = AkshareProvider("em", akshare_module=module).fetch(resolve_symbol("usAAPL"), deadline=9.0)
    symbols = [call["symbol"] for call in module.calls]
    assert symbols == ["105.AAPL", "106.AAPL", "107.AAPL"]
    assert payload["adjusted"] is True


def test_akshare_sina_volume_is_converted_to_lots(offline_akshare):
    bars = _lcg_bars(64)
    frame = _Frame(
        [
            {
                "date": b["date"],
                "open": b["open"],
                "high": b["high"],
                "low": b["low"],
                "close": b["close"],
                # Sina reports A-share turnover in shares; the rest of the
                # stack (Tencent/East Money) uses 手.
                "volume": b["volume"] * 100,
            }
            for b in bars
        ]
    )
    module = offline_akshare(FakeAkshare({"stock_zh_a_daily": frame}))
    payload = AkshareProvider("sina", akshare_module=module).fetch(resolve_symbol("sh600519"), deadline=5.0)
    assert payload["data"][0]["volume"] == float(bars[0]["volume"])
    assert module.calls[-1]["symbol"] == "sh600519"
    assert module.calls[-1]["adjust"] == "qfq"


def test_akshare_sina_is_not_used_for_etf():
    assert AkshareProvider("sina").supports(resolve_symbol("sh600519")) is True
    assert AkshareProvider("sina").supports(resolve_symbol("sh510300")) is False
    assert AkshareProvider("em").supports(resolve_symbol("sh510300")) is True


def test_akshare_missing_function_is_reported_clearly(offline_akshare):
    module = offline_akshare(FakeAkshare({}))
    with pytest.raises(ProviderDataError) as excinfo:
        AkshareProvider("em", akshare_module=module).fetch(resolve_symbol("sh600519"), deadline=5.0)
    assert "stock_zh_a_hist" in str(excinfo.value)


def test_akshare_network_error_is_wrapped_as_provider_unavailable(offline_akshare):
    module = offline_akshare(FakeAkshare({"stock_zh_a_hist": ConnectionError("boom")}))
    with pytest.raises(ProviderUnavailable) as excinfo:
        AkshareProvider("em", akshare_module=module).fetch(resolve_symbol("sh600519"), deadline=5.0)
    assert "akshare:em" in str(excinfo.value)


def test_akshare_timeout_is_bounded_by_the_tier_budget(offline_akshare, monkeypatch):
    import time as _time

    def slow(**kwargs: Any) -> _Frame:  # noqa: ARG001
        _time.sleep(5)
        return _em_frame()

    module = offline_akshare(FakeAkshare({"stock_zh_a_hist": slow}))
    started = _time.monotonic()
    with pytest.raises(ProviderTimeout) as excinfo:
        AkshareProvider("em", akshare_module=module).fetch(resolve_symbol("sh600519"), deadline=0.2)
    elapsed = _time.monotonic() - started
    assert elapsed < 2.0, elapsed
    assert "未返回" in str(excinfo.value)


# ─── node fallback tier ───────────────────────────────────


def test_node_tencent_payload_is_labelled_adjusted_qfq():
    bars = _lcg_bars(40)
    runner = lambda args, deadline: _tencent_payload(bars)  # noqa: E731
    payload = LegacyNodeProvider(runner=runner).fetch(resolve_symbol("sh600519"), deadline=5.0)
    assert payload["source"] == "node:tencent"
    assert payload["adjusted"] is True
    assert payload["count"] == 40


def test_node_legacy_sina_fallback_is_labelled_unadjusted():
    bars = _lcg_bars(40)
    runner = lambda args, deadline: _sina_payload(bars)  # noqa: E731
    payload = LegacyNodeProvider(runner=runner).fetch(resolve_symbol("sh600519"), deadline=5.0)
    assert payload["source"] == "node:sina"
    assert payload["adjusted"] is False


def test_node_provider_never_passes_a_bar_count():
    seen: List[List[str]] = []

    def runner(args: Sequence[str], deadline: float) -> Dict[str, Any]:  # noqa: ARG001
        seen.append(list(args))
        return _tencent_payload(_lcg_bars(40))

    LegacyNodeProvider(runner=runner).fetch(resolve_symbol("sh600519"), deadline=5.0)
    assert seen == [["history", "sh600519"]]

    LegacyNodeProvider(runner=runner).fetch(resolve_symbol("sh600519"), period="weekly", deadline=5.0)
    assert seen[-1] == ["history", "sh600519", "weekly"]


def test_node_provider_surfaces_the_script_error_message():
    runner = lambda args, deadline: {"error": "暂无K线数据"}  # noqa: E731
    with pytest.raises(ProviderDataError) as excinfo:
        LegacyNodeProvider(runner=runner).fetch(resolve_symbol("hk00700"), deadline=5.0)
    assert "暂无K线数据" in str(excinfo.value)


# ─── orchestration ────────────────────────────────────────


def _failing(name: str) -> LegacyNodeProvider:
    return LegacyNodeProvider(runner=lambda args, deadline: {"error": f"{name} down"})


def test_ladder_degrades_from_akshare_to_node(offline_akshare):
    module = offline_akshare(FakeAkshare({"stock_zh_a_hist": ConnectionError("em blocked")}))
    bars = _lcg_bars(120)
    ladder = [
        AkshareProvider("em", akshare_module=module),
        LegacyNodeProvider(runner=lambda args, deadline: _tencent_payload(bars)),
    ]
    payload = providers.fetch_history("sh600519", ladder=ladder, timeout=20)
    assert payload["source"] == "node:tencent"
    assert payload["adjusted"] is True
    assert payload["degraded"] is True
    assert payload["warnings"] == []
    assert payload["attempts"][0]["source"] == "akshare:em"
    assert "em blocked" in payload["attempts"][0]["error"]


def test_ladder_falls_through_em_family_to_sina_family(offline_akshare):
    module = offline_akshare(
        FakeAkshare(
            {
                "stock_zh_a_hist": ConnectionError("em blocked"),
                "stock_zh_a_daily": _sina_frame(),
            }
        )
    )
    payload = providers.fetch_history("sh600519", timeout=20)
    assert payload["source"] == "akshare:sina"
    assert payload["adjusted"] is True
    assert [call["name"] for call in module.calls] == ["stock_zh_a_hist", "stock_zh_a_daily"]


def test_degraded_payload_carries_warning_and_source():
    bars = _lcg_bars(120)
    ladder = [
        _FailingTier("akshare:em"),
        LegacyNodeProvider(runner=lambda args, deadline: _sina_payload(bars)),
    ]
    payload = providers.fetch_history("sh600519", ladder=ladder, timeout=20)
    assert payload["source"] == "node:sina"
    assert payload["adjusted"] is False
    assert payload["degraded"] is True
    assert payload["warnings"] == [providers.WARNING_UNADJUSTED]


def test_strict_adjust_refuses_raw_payload():
    bars = _lcg_bars(120)
    ladder = [LegacyNodeProvider(runner=lambda args, deadline: _sina_payload(bars))]
    with pytest.raises(AdjustedDataUnavailable) as excinfo:
        providers.fetch_history("sh600519", ladder=ladder, timeout=20, strict_adjust=True)
    assert "不复权" in str(excinfo.value)


def test_strict_adjust_env_switch_is_honoured_without_raising(monkeypatch):
    monkeypatch.setenv("IA_REQUIRE_ADJUSTED", "1")
    assert providers.strict_adjust_default() is True
    bars = _lcg_bars(120)
    monkeypatch.setattr(
        providers,
        "build_ladder",
        lambda ref, **kwargs: [
            _FailingTier("akshare:em"),
            LegacyNodeProvider(runner=lambda args, deadline: _sina_payload(bars)),
        ],
    )
    result = fetcher.history("sh600519", strict_adjust=None)
    assert "不复权" in result["error"]
    assert result["data"] == []
    assert result["adjusted"] is None


def test_allow_degraded_false_keeps_raw_data_out():
    bars = _lcg_bars(120)
    ladder = [
        LegacyNodeProvider(runner=lambda args, deadline: _sina_payload(bars)),
    ]
    with pytest.raises(ProvidersExhausted) as excinfo:
        providers.fetch_history("sh600519", ladder=ladder, timeout=20, allow_degraded=False)
    assert "不复权" in str(excinfo.value)


def test_every_tier_failure_is_reported_with_its_reason():
    ladder = [_FailingTier("akshare:em"), _FailingTier("node")]
    with pytest.raises(ProvidersExhausted) as excinfo:
        providers.fetch_history("hk00700", ladder=ladder, timeout=20)
    message = str(excinfo.value)
    assert "akshare:em" in message and "node" in message
    assert len(excinfo.value.attempts) == 2


def test_hk_and_us_have_a_node_fallback_tier():
    """The original weakness: hk/us had no fallback at all."""

    for symbol in ["hk00700", "usAAPL"]:
        ref = resolve_symbol(symbol)
        names = [tier.name for tier in providers.build_ladder(ref, use_akshare=False)]
        assert "node" in names, symbol
    # with akshare available hk/us get the akshare families in front of the node tier
    names = [tier.name for tier in providers.build_ladder(resolve_symbol("hk00700"), use_akshare=True)]
    assert names == ["akshare:em", "akshare:sina", "node"]


def test_etf_ladder_has_no_unadjusted_akshare_tier():
    names = [tier.name for tier in providers.build_ladder(resolve_symbol("sh510300"), use_akshare=True)]
    assert names == ["akshare:em", "node"]


# ─── fetcher compatibility ────────────────────────────────


def test_fetcher_history_returns_legacy_fields_and_new_provenance(monkeypatch):
    bars = _lcg_bars(200)
    payload = {
        "code": "sh600519",
        "market": "cn",
        "instrument": "stock",
        "source": "akshare:sina",
        "adjusted": True,
        "count": 200,
        "data": bars,
    }
    monkeypatch.setattr(providers, "build_ladder", lambda ref, **kwargs: [_StaticTier(payload)])
    result = fetcher.history("sh600519", lookback=60)
    for field in ("code", "market", "count", "data", "indicators"):
        assert field in result, field
    assert result["count"] == 200
    assert len(result["data"]) == 61  # legacy contract: last lookback + 1 bars
    assert result["indicators"]["mas"]["ma5"] is not None
    assert result["source"] == "akshare:sina"
    assert result["adjusted"] is True
    assert result["degraded"] is False
    assert result["warnings"] == []


def test_fetcher_history_lookback_zero_returns_everything(monkeypatch):
    bars = _lcg_bars(80)
    payload = {
        "code": "sh600519", "market": "cn", "instrument": "stock",
        "source": "node:tencent", "adjusted": True, "count": 80, "data": bars,
    }
    monkeypatch.setattr(providers, "build_ladder", lambda ref, **kwargs: [_StaticTier(payload)])
    result = fetcher.history("sh600519")
    assert result["count"] == 80
    assert len(result["data"]) == 80
    assert result["degraded"] is False


def test_fetcher_history_reports_exhaustion_as_an_error_payload(monkeypatch):
    def boom(*args: Any, **kwargs: Any) -> Any:
        raise ProvidersExhausted(
            "hk00700",
            [
                ("akshare:em", ProviderUnavailable("em blocked", source="akshare:em")),
                ("node", ProviderUnavailable("node down", source="node")),
            ],
        )

    monkeypatch.setattr(providers, "fetch_history", boom)
    result = fetcher.history("hk00700")
    assert result["error"]
    assert "akshare:em" in result["error"] and "node" in result["error"]
    assert result["data"] == [] and result["count"] == 0
    assert result["adjusted"] is None
    assert result["degraded"] is True
    assert len(result["attempts"]) == 2


def test_fetcher_history_returns_invalid_code_error_without_raising():
    result = fetcher.history("!!!")
    assert result["error"] == "无效代码"


def test_fetcher_snapshot_and_market_list_still_use_the_node_script(monkeypatch):
    """snapshot/search/market_list must stay untouched by the history rewrite."""

    calls: List[List[str]] = []

    class _Completed:
        returncode = 0
        stderr = b""

        def __init__(self, payload: Any) -> None:
            self.stdout = json.dumps(payload).encode("utf-8")

    def fake_run(args: Sequence[str], **kwargs: Any) -> Any:  # noqa: ARG001
        calls.append(list(args))
        # args == ["node", "<repo>/scripts/stock-fetcher.js", command, ...]
        if args[2] == "snapshot":
            return _Completed({"code": "sh600519", "name": "贵州茅台"})
        return _Completed({"data": [{"code": "sh600519"}]})

    monkeypatch.setattr(fetcher.subprocess, "run", fake_run)
    assert fetcher.snapshot("600519")["name"] == "贵州茅台"
    assert fetcher.market_list("cn", limit=10)["data"]
    assert [call[2] for call in calls] == ["snapshot", "market-list"]


# ─── indicators ───────────────────────────────────────────


def _js_indicators(bars: Sequence[Mapping[str, Any]], tmp_path: Path | None = None) -> Dict[str, Any]:
    """Run the *shipped* JavaScript indicator engine on ``bars``.

    The function source is extracted verbatim from scripts/stock-fetcher.js
    (nothing is re-implemented and the file is not modified) and written to a
    temporary script: passing ~60 KB through ``node -e`` overflows the Windows
    command line (CreateProcess error 206).
    """

    source = SCRIPT.read_text(encoding="utf-8")
    start = source.index("function sma(arr, n) {")
    end = source.index("\nasync function main()")
    harness = (
        source[start:end]
        + "\nconsole.log(JSON.stringify(computeAllIndicators("
        + json.dumps([dict(bar) for bar in bars])
        + ")));"
    )
    directory = tmp_path if tmp_path is not None else Path(os.environ.get("TEMP", "."))
    script = directory / "ia_indicator_parity.js"
    script.write_text(harness, encoding="utf-8")
    proc = subprocess.run(
        ["node", str(script)], check=True, capture_output=True, text=True, encoding="utf-8"
    )
    return json.loads(proc.stdout)


def test_indicator_parity_with_legacy_javascript(tmp_path):
    bars = _lcg_bars(400)
    js = _js_indicators(bars, tmp_path)
    py = indicators.compute_all_indicators(bars)
    assert py == js


def test_indicator_parity_holds_for_a_short_series(tmp_path):
    bars = _lcg_bars(45)
    assert indicators.compute_all_indicators(bars) == _js_indicators(bars, tmp_path)


def test_indicator_parity_holds_for_a_series_full_of_ties(tmp_path):
    """Flat closes make every rounding tie explicit instead of accidental."""

    bars = [
        {
            "date": f"2021-01-{(index % 28) + 1:02d}",
            "open": 10.125,
            "high": 10.125,
            "low": 10.125,
            "close": 10.125,
            "volume": 1_000_000 + index,
        }
        for index in range(60)
    ]
    assert indicators.compute_all_indicators(bars) == _js_indicators(bars, tmp_path)


def test_indicators_require_thirty_bars():
    assert "error" in indicators.compute_all_indicators(_lcg_bars(29))
    assert "error" not in indicators.compute_all_indicators(_lcg_bars(30))


def test_volume_indicators_use_the_last_twenty_bars():
    bars = _lcg_bars(60)
    result = indicators.compute_all_indicators(bars)
    volumes = [bar["volume"] for bar in bars]
    assert result["volume"]["latest"] == volumes[-1]
    assert result["volume"]["ma5"] == to_fixed(sum(volumes[-5:]) / 5, 2)
    assert result["volume"]["ratio"] == to_fixed(volumes[-1] / result["volume"]["ma5"], 2)
    assert result["obv"] == sum(
        volumes[i] if bars[i]["close"] > bars[i - 1]["close"] else -volumes[i]
        for i in range(len(bars) - 19, len(bars))
        if bars[i]["close"] != bars[i - 1]["close"]
    )


def test_tiers_conform_to_the_bar_provider_protocol():
    assert isinstance(AkshareProvider("em"), base.BarProvider)
    assert isinstance(AkshareProvider("sina"), base.BarProvider)
    assert isinstance(LegacyNodeProvider(), base.BarProvider)


def test_non_qfq_adjust_is_refused_instead_of_mislabelled():
    with pytest.raises(base.ProviderError):
        providers.fetch_history("sh600519", adjust="hfq", ladder=[LegacyNodeProvider()])
    with pytest.raises(base.ProviderError):
        providers.fetch_history("sh600519", period="yearly", ladder=[LegacyNodeProvider()])


# ─── packaging / dependency guards ────────────────────────


def test_requirements_pin_akshare_in_both_files():
    """The pinned akshare version must not silently disappear."""

    for name in ("requirements.txt", "requirements-lock.txt"):
        text = (ROOT / name).read_text(encoding="utf-8")
        assert "akshare==1.19.1" in text, name


def test_ladder_still_works_when_akshare_is_not_installed(monkeypatch):
    """akshare needs Python >= 3.11; older interpreters must still get data."""

    def missing() -> Any:
        raise ProviderUnavailable("akshare 未安装，本次请求跳过 akshare 数据源", source="akshare:em")

    monkeypatch.setattr(akshare_provider, "_AKSHARE_AVAILABLE", None)
    monkeypatch.setattr(akshare_provider, "_import_akshare", missing)
    assert akshare_provider.akshare_available() is False
    for symbol in ("sh600519", "hk00700", "usAAPL", "sh510300"):
        names = [tier.name for tier in providers.build_ladder(resolve_symbol(symbol))]
        assert names == ["node"], symbol


# ─── live smoke tests (opt-in) ────────────────────────────


@_live
@pytest.mark.parametrize("symbol", ["sh600519", "hk00700", "usAAPL", "sh510300"])
def test_live_history_returns_data_with_provenance(symbol: str):
    result = fetcher.history(symbol)
    assert not result.get("error"), result.get("error")
    assert result["count"] > 0
    assert len(result["data"]) > 0
    assert result["source"]
    assert result["adjusted"] in (True, False)
    assert result["data"][-1]["date"].count("-") == 2


@_live
def test_live_qfq_sources_agree_with_the_node_source_on_closes():
    """Cross-source guard: a shift in复权 semantics would show up here."""

    node = legacy_node_provider.run_legacy_history("sh600519")
    akshare_bars = providers.fetch_history("sh600519", timeout=25)
    node_closes = {bar["date"]: bar["close"] for bar in node["data"]}
    shared = [bar for bar in akshare_bars["data"] if bar["date"] in node_closes]
    assert len(shared) > 100
    for bar in shared[-30:]:
        assert abs(node_closes[bar["date"]] - bar["close"]) < 0.02, bar["date"]


@_live
def test_live_degradation_path_is_reachable(monkeypatch):
    """Force the akshare tier to fail and prove the Node tier answers."""

    def broken(**kwargs: Any) -> Any:  # noqa: ARG001
        raise ConnectionError("forced failure")

    monkeypatch.setattr(akshare_provider, "_import_akshare", lambda: FakeAkshare({
        "stock_zh_a_hist": broken,
        "stock_zh_a_daily": broken,
        "stock_hk_hist": broken,
        "stock_hk_daily": broken,
        "stock_us_hist": broken,
        "stock_us_daily": broken,
        "fund_etf_hist_em": broken,
    }))
    monkeypatch.setattr(akshare_provider, "_AKSHARE_AVAILABLE", True)
    for symbol in ["sh600519", "sh510300"]:
        result = fetcher.history(symbol)
        assert not result.get("error"), result.get("error")
        assert result["source"].startswith("node:")
        assert result["adjusted"] is True

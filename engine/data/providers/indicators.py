"""Python port of ``computeAllIndicators`` from scripts/stock-fetcher.js.

Why a port at all: ``engine.data.fetcher.history()`` returns an ``indicators``
object, and once akshare becomes the primary bar source the Node process is no
longer guaranteed to run for a given request, so the indicator engine has to
live on the Python side.

The port is written to be *numerically identical* to the JavaScript original,
including its quirks:

* every scalar is rounded with JavaScript ``toFixed`` semantics (see
  :func:`engine.data.providers.base.to_fixed`),
* ``boll`` computes its standard deviation around the *already rounded* mid
  band, exactly like the original,
* ``price_range_30d.position_pct`` reuses the rounded ``high``/``low``,
* ``macd`` historically recomputed a full EMA per prefix (O(n²)); the
  recurrence below is algebraically identical and O(n) so that a 1024-bar
  series does not take seconds per symbol.

``tests/test_kline_providers.py::test_indicator_parity_with_legacy_javascript``
extracts the original functions from the shipped JavaScript and compares both
implementations on a deterministic series, so a future edit to either side
fails loudly instead of silently moving every indicator.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Mapping, Optional, Sequence

from .base import coerce_float, to_fixed

__all__ = ["compute_all_indicators"]

MIN_BARS = 30


def _num(value: Any, fallback: float) -> float:
    number = coerce_float(value)
    return fallback if number is None else number


def _series(bars: Sequence[Mapping[str, Any]], field: str, fallback_field: str = "close") -> List[float]:
    """Extract one numeric column, falling back to close for missing fields.

    akshare (Sina/East Money) and Tencent always ship full OHLCV rows; the
    fallback only matters for degenerate feeds and keeps the indicator maths
    finite instead of propagating ``NaN`` through every downstream metric.
    """

    values: List[float] = []
    for bar in bars:
        fallback = _num(bar.get(fallback_field), 0.0)
        values.append(_num(bar.get(field), fallback))
    return values


def _sma(values: Sequence[float], window: int) -> Optional[float]:
    if len(values) < window:
        return None
    chunk = values[-window:]
    return to_fixed(sum(chunk) / window, 2)


def _ema(values: Sequence[float], window: int) -> Optional[float]:
    if len(values) < window:
        return None
    k = 2 / (window + 1)
    result = sum(values[:window]) / window
    for index in range(window, len(values)):
        result = values[index] * k + result * (1 - k)
    return to_fixed(result, 2)


def _ema_series(values: Sequence[float], window: int) -> List[Optional[float]]:
    """``[_ema(values[:i], window) for i in range(window, len(values) + 1)]``.

    Same numbers as recomputing each prefix from scratch, but incremental.
    """

    if len(values) < window:
        return []
    k = 2 / (window + 1)
    result = sum(values[:window]) / window
    series: List[Optional[float]] = [to_fixed(result, 2)]
    for index in range(window, len(values)):
        result = values[index] * k + result * (1 - k)
        series.append(to_fixed(result, 2))
    return series


def _rsi(closes: Sequence[float], window: int) -> Optional[float]:
    if len(closes) < window + 1:
        return None
    avg_gain = 0.0
    avg_loss = 0.0
    for index in range(len(closes) - window, len(closes)):
        diff = closes[index] - closes[index - 1]
        if diff > 0:
            avg_gain += diff
        else:
            avg_loss += abs(diff)
    avg_gain /= window
    avg_loss /= window
    if avg_loss == 0:
        return 100
    return to_fixed(100 - 100 / (1 + avg_gain / avg_loss), 2)


def _macd(closes: Sequence[float]) -> Optional[Dict[str, Optional[float]]]:
    if len(closes) < 26:
        return None
    ema12_prefix = _ema_series(closes, 12)
    ema26_prefix = _ema_series(closes, 26)
    if not ema12_prefix or not ema26_prefix:
        return None
    # prefix series are indexed from their own start: R12(i) sits at index
    # ``i - 12`` and R26(i) at ``i - 26``; the JavaScript loop walks i = 26..n.
    offset = 26 - 12
    dif = to_fixed(ema12_prefix[-1] - ema26_prefix[-1], 4)
    slices: List[float] = []
    for index in range(len(ema26_prefix)):
        e12 = ema12_prefix[offset + index]
        e26 = ema26_prefix[index]
        if e12 is not None and e26 is not None:
            slices.append(e12 - e26)
    dea = _ema(slices, 9)
    bar = to_fixed((dif - dea) * 2, 4) if dea is not None else None
    return {"dif": dif, "dea": dea, "bar": bar}


def _boll(closes: Sequence[float]) -> Optional[Dict[str, float]]:
    if len(closes) < 20:
        return None
    mid = _sma(closes, 20)
    if mid is None:
        return None
    chunk = closes[-20:]
    std = math.sqrt(sum((value - mid) ** 2 for value in chunk) / 20)
    return {
        "upper": to_fixed(mid + 2 * std, 2),
        "mid": to_fixed(mid, 2),
        "lower": to_fixed(mid - 2 * std, 2),
        "width": to_fixed((4 * std / mid) * 100, 2) if mid else None,
    }


def _kdj(highs: Sequence[float], lows: Sequence[float], closes: Sequence[float]) -> Optional[Dict[str, float]]:
    window = 9
    if len(closes) < window:
        return None
    rsvs: List[float] = []
    for index in range(window - 1, min(len(highs), len(closes))):
        window_highs = highs[index - window + 1: index + 1]
        window_lows = lows[index - window + 1: index + 1]
        highest = max(window_highs)
        lowest = min(window_lows)
        denominator = highest - lowest
        if not math.isfinite(denominator) or denominator == 0:
            rsvs.append(50.0)
            continue
        rsv = ((closes[index] - lowest) / denominator) * 100
        rsvs.append(50.0 if not math.isfinite(rsv) else rsv)
    k = 50.0
    d = 50.0
    for rsv in rsvs:
        k = (2 / 3) * k + (1 / 3) * rsv
        d = (2 / 3) * d + (1 / 3) * k
    j = 3 * k - 2 * d
    return {"k": to_fixed(k, 2), "d": to_fixed(d, 2), "j": to_fixed(j, 2)}


def _wr(highs: Sequence[float], lows: Sequence[float], closes: Sequence[float]) -> Optional[float]:
    window = 14
    if len(highs) < window:
        return None
    highest = max(highs[-window:])
    lowest = min(lows[-window:])
    denominator = highest - lowest
    if not math.isfinite(denominator) or denominator == 0:
        # JS produced NaN here and JSON.stringify turned it into null.
        return None
    value = ((highest - closes[-1]) / denominator) * 100
    return None if not math.isfinite(value) else to_fixed(value, 2)


def _atr(highs: Sequence[float], lows: Sequence[float], closes: Sequence[float]) -> Optional[float]:
    window = 14
    if len(highs) < window + 1:
        return None
    total = 0.0
    for index in range(len(highs) - window, len(highs)):
        high_low = highs[index] - lows[index]
        high_prev = abs(highs[index] - closes[index - 1])
        low_prev = abs(lows[index] - closes[index - 1])
        total += max(high_low, high_prev, low_prev)
    return to_fixed(total / window, 2)


def _obv(closes: Sequence[float], volumes: Sequence[float]) -> Optional[float]:
    if len(closes) < 20:
        return None
    recent = closes[-20:]
    recent_volume = volumes[-20:]
    obv = 0.0
    for index in range(1, len(recent)):
        if recent[index] > recent[index - 1]:
            obv += recent_volume[index]
        elif recent[index] < recent[index - 1]:
            obv -= recent_volume[index]
    return obv


def compute_all_indicators(
    kline_data: Sequence[Mapping[str, Any]],
    realtime: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """Drop-in replacement for the JavaScript ``computeAllIndicators``."""

    if not kline_data or len(kline_data) < MIN_BARS:
        return {"error": "数据不足，至少需要30个交易日"}

    closes = _series(kline_data, "close")
    highs = _series(kline_data, "high")
    lows = _series(kline_data, "low")
    volumes = _series(kline_data, "volume", fallback_field="close")
    price = closes[-1]

    mas = {
        "ma5": _sma(closes, 5),
        "ma10": _sma(closes, 10),
        "ma20": _sma(closes, 20),
        "ma60": _sma(closes, 60),
        "ma120": _sma(closes, 120),
        "ma250": _sma(closes, 250),
    }

    ma_order = [mas["ma5"], mas["ma10"], mas["ma20"]]
    ma_alignment = "未知"
    if all(value is not None for value in ma_order):
        if mas["ma5"] > mas["ma10"] > mas["ma20"]:
            ma_alignment = "多头排列"
        elif mas["ma5"] < mas["ma10"] < mas["ma20"]:
            ma_alignment = "空头排列"
        else:
            ma_alignment = "交叉/缠绕"

    rsi_values = {
        "rsi6": _rsi(closes, 6),
        "rsi14": _rsi(closes, 14),
        "rsi24": _rsi(closes, 24),
    }

    macd_data = _macd(closes)
    boll_data = _boll(closes)
    if boll_data:
        if price >= boll_data["upper"]:
            boll_position = "突破上轨"
        elif price >= boll_data["mid"]:
            boll_position = "上轨与中轨之间"
        elif price >= boll_data["lower"]:
            boll_position = "中轨与下轨之间"
        else:
            boll_position = "跌破下轨"
    else:
        boll_position = None

    kdj_data = _kdj(highs, lows, closes)
    wr_data = _wr(highs, lows, closes)
    atr_data = _atr(highs, lows, closes)

    vol_ma5 = _sma(volumes, 5)
    latest_volume = volumes[-1]
    volume_ratio = to_fixed(latest_volume / vol_ma5, 2) if vol_ma5 else None

    obv_data = _obv(closes, volumes)

    high30 = to_fixed(max(highs[-30:]), 2)
    low30 = to_fixed(min(lows[-30:]), 2)
    if high30 is not None and low30 is not None and high30 != low30:
        price_position = to_fixed(((price - low30) / (high30 - low30)) * 100, 1)
    else:
        price_position = None

    boll_mid = boll_data["mid"] if boll_data else _sma(closes, 20)
    if boll_mid:
        slice20 = closes[-20:]
        std20 = math.sqrt(sum((value - boll_mid) ** 2 for value in slice20) / 20)
        volatility = to_fixed((std20 / boll_mid) * 100, 2)
    else:
        volatility = None

    turnover = None
    if isinstance(realtime, Mapping) and realtime.get("turnover"):
        turnover = realtime["turnover"]

    def change_over(window: int) -> Optional[float]:
        if len(closes) < window or not closes[-window]:
            return None
        return to_fixed(((closes[-1] - closes[-window]) / closes[-window]) * 100, 2)

    return {
        "mas": mas,
        "ma_alignment": ma_alignment,
        "rsi": rsi_values,
        "macd": macd_data,
        "boll": boll_data,
        "boll_position": boll_position,
        "kdj": kdj_data,
        "wr": wr_data,
        "atr": atr_data,
        "volume": {
            "latest": latest_volume,
            "ma5": vol_ma5,
            "ma10": _sma(volumes, 10),
            "ma20": _sma(volumes, 20),
            "ratio": volume_ratio,
        },
        "obv": obv_data,
        "price_range_30d": {"high": high30, "low": low30, "position_pct": price_position},
        "volatility": volatility,
        "turnover": turnover,
        "change": {"d5": change_over(5), "d10": change_over(10), "d20": change_over(20)},
    }

"""Shared contracts for the K-line provider layer.

Every provider returns the *same* normalized payload shape::

    {
      "code": "sh600519",          # provider-side instrument code
      "market": "cn",              # cn | hk | us
      "instrument": "stock",       # stock | etf (akshare routing only)
      "source": "akshare:em",      # which upstream actually answered
      "adjusted": True,            # True == qfq (前复权) semantics
      "count": 640,                # bars available at the source
      "data": [{"date": "YYYY-MM-DD", "open": .., "high": ..,
                "low": .., "close": .., "volume": ..}, ...],
    }

``source`` and ``adjusted`` are mandatory: a caller must always be able to
tell which upstream served a series and whether the prices are adjusted.
``adjusted=False`` means the series is *raw* (不复权) and indicators computed
from it are not comparable with the qfq series the app has always used.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal, localcontext
from typing import (
    Any,
    Dict,
    Iterable,
    List,
    Mapping,
    Optional,
    Protocol,
    Sequence,
    Tuple,
    runtime_checkable,
)

__all__ = [
    "MARKETS",
    "MAX_BARS",
    "BAR_FIELDS",
    "ProviderError",
    "ProviderUnavailable",
    "ProviderTimeout",
    "ProviderDataError",
    "SymbolNotSupported",
    "ProvidersExhausted",
    "AdjustedDataUnavailable",
    "SymbolRef",
    "resolve_symbol",
    "to_fixed",
    "to_iso_date",
    "coerce_float",
    "normalize_bars",
    "validate_payload",
    "BarProvider",
]

#: Markets the provider layer understands.  These mirror
#: ``detectMarket()`` in scripts/stock-fetcher.js so that the ``market`` field
#: of ``engine.data.fetcher.history()`` keeps its historical values.
MARKETS: Tuple[str, ...] = ("cn", "hk", "us")

#: Legacy ``history`` requests 1023 bars and the Tencent source returns up to
#: 1024 (hk).  akshare happily returns the whole listing history (6000+ bars for
#: 600519), so cap it: every indicator below only looks at the last 250 bars,
#: and capping keeps the MACD recurrence bounded.
MAX_BARS = 1024

BAR_FIELDS: Tuple[str, ...] = ("date", "open", "high", "low", "close", "volume")


# ─── errors ───────────────────────────────────────────────


class ProviderError(RuntimeError):
    """Base class for every provider-layer failure.

    ``source`` names the upstream that failed so that an orchestration error can
    list *why* each tier was skipped instead of collapsing into one message.
    """

    def __init__(
        self,
        message: str,
        *,
        source: str = "unknown",
        detail: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.source = source
        self.detail = detail or message

    def __str__(self) -> str:  # pragma: no cover - trivial
        return super().__str__()


class ProviderUnavailable(ProviderError):
    """The upstream could not be reached, or its client library is missing."""


class ProviderTimeout(ProviderError):
    """The upstream did not answer inside its share of the caller's budget."""


class ProviderDataError(ProviderError):
    """The upstream answered, but the payload was empty or unusable."""


class SymbolNotSupported(ProviderError):
    """The symbol cannot be resolved to a market/instrument."""

    def __init__(self, symbol: str) -> None:
        super().__init__("无效代码", source="resolver", detail=f"unresolved symbol: {symbol!r}")
        self.symbol = symbol


class ProvidersExhausted(ProviderError):
    """Every tier of the ladder failed; ``attempts`` holds each reason."""

    def __init__(self, symbol: str, attempts: Sequence[Tuple[str, ProviderError]]) -> None:
        self.symbol = symbol
        self.attempts: Tuple[Tuple[str, ProviderError], ...] = tuple(attempts)
        reasons = "; ".join(f"{source}: {err}" for source, err in self.attempts) or "no provider available"
        super().__init__(
            f"K线获取失败 {symbol} —— {reasons}",
            source="orchestrator",
            detail=reasons,
        )


class AdjustedDataUnavailable(ProviderError):
    """Raised when only raw (不复权) data is available and strict mode is on."""

    def __init__(self, symbol: str, source: str, attempts: Sequence[Tuple[str, ProviderError]] = ()) -> None:
        reasons = "; ".join(f"{src}: {err}" for src, err in attempts)
        message = f"{symbol} 仅能获取不复权数据（来源 {source}），已按严格复权模式拒绝"
        if reasons:
            message = f"{message}；此前失败：{reasons}"
        super().__init__(message, source=source)
        self.symbol = symbol


# ─── symbol resolution ────────────────────────────────────


@dataclass(frozen=True)
class SymbolRef:
    """A resolved symbol.

    ``market``/``code`` reproduce ``detectMarket()`` from the bundled Node
    fetcher byte-for-byte; ``instrument`` is the finer distinction akshare
    needs (its ETF history endpoint is separate from the stock one).
    """

    raw: str
    market: str
    code: str
    instrument: str = "stock"

    @property
    def is_etf(self) -> bool:
        return self.instrument == "etf"

    def with_instrument(self, instrument: str) -> "SymbolRef":
        return SymbolRef(self.raw, self.market, self.code, instrument)


_CN_PREFIXED = re.compile(r"^(sh|sz|bj)\d{6}$")
_FIVE_DIGITS = re.compile(r"^\d{5}$")
_SIX_DIGITS = re.compile(r"^\d{6}$")
_ALPHA_TICKER = re.compile(r"^[A-Za-z.]+$")


def _instrument_for_cn(code: str) -> str:
    """Split Shanghai/Shenzhen funds out of plain A-share codes."""

    lower = code.lower()
    body = lower[2:] if lower[:2] in ("sh", "sz", "bj") else lower
    if lower.startswith("sh") and body[:1] == "5":
        return "etf"
    if lower.startswith("sz") and body[:2] in ("15", "16", "18"):
        return "etf"
    return "stock"


def resolve_symbol(raw: Any, *, market: Optional[str] = None) -> SymbolRef:
    """Resolve ``raw`` to a :class:`SymbolRef`, mirroring ``detectMarket()``.

    The branch order (and therefore the quirks, e.g. ``HKD`` resolving to
    Hong Kong code ``D``) is intentionally identical to the Node fetcher so the
    ``market``/``code`` fields stay backward compatible.
    """

    text = "" if raw is None else str(raw).strip()
    if not text:
        raise SymbolNotSupported(text)

    forced = str(market or "").strip().lower()
    if forced:
        if forced not in set(MARKETS) | {"etf"}:
            raise SymbolNotSupported(text)
        if forced == "etf":
            resolved = resolve_symbol(text)
            if resolved.market != "cn":
                raise SymbolNotSupported(text)
            return resolved.with_instrument("etf")
        resolved = resolve_symbol(text)
        if resolved.market != forced:
            raise SymbolNotSupported(text)
        return resolved

    lower = text.lower()
    if lower.startswith("hk"):
        return SymbolRef(text, "hk", text[2:].upper())
    if lower.startswith("us"):
        return SymbolRef(text, "us", text[2:].upper())
    if _CN_PREFIXED.match(lower):
        return SymbolRef(text, "cn", lower, _instrument_for_cn(lower))
    if _FIVE_DIGITS.match(text):
        return SymbolRef(text, "hk", text)
    if _SIX_DIGITS.match(text):
        first = text[0]
        if first in ("6", "5"):
            code = f"sh{text}"
        elif first in ("4", "8"):
            code = f"bj{text}"
        else:
            code = f"sz{text}"
        return SymbolRef(text, "cn", code, _instrument_for_cn(code))
    if _ALPHA_TICKER.match(text) and len(text) <= 10:
        return SymbolRef(text, "us", text.upper())
    raise SymbolNotSupported(text)


# ─── numeric / date normalization ─────────────────────────


def to_fixed(value: Any, digits: int = 2) -> Optional[float]:
    """Round like JavaScript ``Number.prototype.toFixed``.

    ``toFixed`` rounds on the exact binary value and, per spec step 6/7, takes
    the absolute value *before* choosing the digit — so ties go away from zero,
    i.e. decimal ``ROUND_HALF_UP``.  That is neither Python's ``round()``
    (half-even) nor the "pick the larger n" reading one might expect for
    negative values: ``(-0.125).toFixed(2) === "-0.13"`` in V8, verified by
    ``tests/test_kline_providers.py::test_to_fixed_matches_javascript_tofixed_including_ties``.

    The indicator engine in scripts/stock-fetcher.js rounds with ``toFixed``
    everywhere, so this helper exists purely to keep the Python port
    bit-identical to the JavaScript original.
    """

    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    quantum = Decimal(1).scaleb(-digits)
    with localcontext() as ctx:
        ctx.prec = 60
        quantized = Decimal(number).quantize(quantum, rounding=ROUND_HALF_UP)
    return float(quantized)


def coerce_float(value: Any) -> Optional[float]:
    """Best-effort float conversion; returns ``None`` for junk/non-finite."""

    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    else:
        text = str(value).strip().replace(",", "")
        if not text:
            return None
        try:
            number = float(text)
        except ValueError:
            return None
    return number if math.isfinite(number) else None


_DATE_PATTERNS: Tuple[str, ...] = ("%Y-%m-%d", "%Y%m%d", "%Y/%m/%d", "%Y.%m.%d")


def to_iso_date(value: Any) -> Optional[str]:
    """Normalize a date-like value to ``YYYY-MM-DD``."""

    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    # pandas.Timestamp / numpy.datetime64 and friends expose str() as ISO text.
    text = str(value).strip()
    if not text:
        return None
    head = text[:10]
    for pattern in _DATE_PATTERNS:
        candidate = text[:10] if pattern == "%Y-%m-%d" else text[:8] if pattern == "%Y%m%d" else text[:10]
        try:
            return datetime.strptime(candidate, pattern).strftime("%Y-%m-%d")
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("/", "-")).strftime("%Y-%m-%d")
    except ValueError:
        return None


#: Column aliases seen across akshare endpoints (East Money emits Chinese
#: headers, Sina emits English ones) and the bundled Node fetcher.
_COLUMN_ALIASES: Dict[str, Tuple[str, ...]] = {
    "date": ("date", "day", "日期", "时间", "trade_date"),
    "open": ("open", "开盘", "开盘价"),
    "high": ("high", "最高", "最高价"),
    "low": ("low", "最低", "最低价"),
    "close": ("close", "收盘", "收盘价"),
    "volume": ("volume", "vol", "成交量", "成交量(手)"),
}


def normalize_bars(rows: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    """Convert arbitrary provider rows into the unified bar structure.

    Rows without a parsable date or close are dropped (never silently turned
    into zeros); the result is sorted by date and deduplicated keeping the last
    occurrence so upstream revisions win.
    """

    bars: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, Mapping):
            continue
        lowered = {str(key).strip().lower(): value for key, value in row.items()}
        resolved: Dict[str, Any] = {}
        for field_name, aliases in _COLUMN_ALIASES.items():
            for alias in aliases:
                candidate = alias if alias in lowered else alias.lower()
                if candidate in lowered:
                    resolved[field_name] = lowered[candidate]
                    break

        day = to_iso_date(resolved.get("date"))
        close = coerce_float(resolved.get("close"))
        if day is None or close is None:
            continue
        bar = {
            "date": day,
            "open": coerce_float(resolved.get("open")),
            "high": coerce_float(resolved.get("high")),
            "low": coerce_float(resolved.get("low")),
            "close": close,
            "volume": coerce_float(resolved.get("volume")),
        }
        bars[day] = bar
    return [bars[key] for key in sorted(bars)]


def validate_payload(payload: Mapping[str, Any], *, source: str) -> Dict[str, Any]:
    """Final gate every provider payload passes before it leaves a provider."""

    if not isinstance(payload, Mapping):  # pragma: no cover - defensive
        raise ProviderDataError(f"{source} 返回非对象数据", source=source)
    data = payload.get("data")
    if not isinstance(data, list) or not data:
        raise ProviderDataError(f"{source} 未返回K线数据", source=source)
    if "adjusted" not in payload:
        raise ProviderDataError(f"{source} 未标记复权语义", source=source)
    if not payload.get("source"):
        raise ProviderDataError(f"{source} 未标记数据来源", source=source)
    return dict(payload)


@dataclass
class ProviderAttempt:
    """Book-keeping for one ladder tier (used for error reporting/audit)."""

    source: str
    ok: bool
    error: Optional[str] = None
    elapsed_ms: int = 0
    extra: Dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class BarProvider(Protocol):
    """The contract every ladder tier implements.

    ``engine.data.providers.fetch_history()`` walks a list of these in order,
    so a tier must either return a payload that passes
    :func:`validate_payload` or raise a :class:`ProviderError` subclass — never
    return an empty/partial series.  ``name`` is the tier label used in
    ``attempts`` before a payload exists; the authoritative provenance label is
    the payload's own ``source`` field.
    """

    name: str

    def supports(self, ref: SymbolRef) -> bool:
        """Whether this tier can serve ``ref`` at all."""
        ...

    def fetch(
        self,
        ref: SymbolRef,
        *,
        period: str = "day",
        deadline: float = 20.0,
        max_bars: int = MAX_BARS,
    ) -> Dict[str, Any]:
        """Fetch the full series for ``ref`` within ``deadline`` seconds."""
        ...

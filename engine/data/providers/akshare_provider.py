"""akshare-backed provider — the primary K-line source.

Two akshare families are used, and the order matters:

``em`` (East Money)
    ``stock_zh_a_hist`` / ``fund_etf_hist_em`` / ``stock_hk_hist`` /
    ``stock_us_hist`` — every one of them supports ``adjust="qfq"`` (前复权),
    matching the semantics the application has always used.

``sina`` (Sina)
    ``stock_zh_a_daily`` / ``stock_hk_daily`` / ``stock_us_daily`` — also
    support ``adjust="qfq"`` and therefore keep the adjusted semantics.
    ``fund_etf_hist_sina`` is deliberately **not** used: it has no ``adjust``
    parameter, so an ETF series fetched through it would be raw (不复权) and
    would silently corrupt every moving average.  ETFs therefore fall through
    to the Node tier, which is qfq.

Empirical note (measured on this workstation, see the task report): the East
Money hosts (``*push2his.eastmoney.com``) intermittently close the connection
for this network path — plain ``requests`` failed 10/10, ``curl_cffi`` 2/3,
``curl.exe`` 3/6 — so in practice the ``sina`` family is what keeps this tier
alive.  Both families are akshare public API, so the tier is still "akshare as
the primary source"; the ``source`` field records which family answered
(``akshare:em`` vs ``akshare:sina``) so the difference stays observable.

Column names differ per family (East Money emits Chinese headers, Sina emits
English ones); :func:`engine.data.providers.base.normalize_bars` accepts both.
Sina reports A-share/ETF turnover in **shares** while the rest of the stack
(Tencent, East Money) reports **手** (100 shares), so cn/etf Sina volumes are
divided by 100 to keep the ``volume`` field comparable across sources — this
was verified against Tencent on four separate sessions (factor 100.0011,
100.0011, 99.9999, 100.0000).
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from .base import (
    MAX_BARS,
    ProviderDataError,
    ProviderError,
    ProviderTimeout,
    ProviderUnavailable,
    SymbolRef,
    normalize_bars,
    validate_payload,
)

logger = logging.getLogger("ai-trading-automation.data.akshare")

SOURCE_EM = "akshare:em"
SOURCE_SINA = "akshare:sina"

#: ``(market, instrument) -> akshare function name`` for the East Money family.
EM_ROUTES: Dict[Tuple[str, str], str] = {
    ("cn", "stock"): "stock_zh_a_hist",
    ("cn", "etf"): "fund_etf_hist_em",
    ("hk", "stock"): "stock_hk_hist",
    ("us", "stock"): "stock_us_hist",
}

#: ``(market, instrument) -> akshare function name`` for the Sina family.
#: Only qfq-capable functions are listed (see the module docstring).
SINA_ROUTES: Dict[Tuple[str, str], str] = {
    ("cn", "stock"): "stock_zh_a_daily",
    ("hk", "stock"): "stock_hk_daily",
    ("us", "stock"): "stock_us_daily",
}

#: akshare's function-name prefix -> symbol format it expects.
#: ``stock_zh_a_hist`` wants a bare 6-digit code, ``stock_zh_a_daily`` wants
#: ``sh600519``, the Hong Kong helpers want a bare 5-digit ``00700``, and
#: ``stock_us_hist`` wants a full East Money secid (``<market>.<TICKER>``).
_BARE_CODE_FUNCS = {"stock_zh_a_hist", "fund_etf_hist_em", "stock_hk_hist", "stock_us_hist"}

#: East Money US market ids: 105 = NASDAQ, 106 = NYSE, 107 = AMEX.
#: akshare's ``stock_us_hist`` passes ``secid`` straight through, so the market
#: prefix cannot be derived from the ticker alone — all three are attempted.
_US_SECID_PREFIXES: Tuple[str, ...] = ("105", "106", "107")

#: East Money's ``period`` vocabulary; the Node fetcher and the Python API use
#: ``day``/``weekly``/``monthly``.
PERIOD_EM = {"day": "daily", "weekly": "weekly", "monthly": "monthly"}

#: Sina reports A-share/ETF volume in shares; Tencent and East Money in 手.
_VOLUME_DIVISOR: Dict[str, float] = {"cn": 100.0, "etf": 100.0}


def _symbol_candidates(function_name: str, ref: SymbolRef) -> List[str]:
    """Symbol spellings to try, in order, for one akshare entry point."""

    if function_name in ("stock_hk_hist", "stock_hk_daily"):
        return [ref.code]
    if function_name == "stock_us_hist":
        return [f"{prefix}.{ref.code}" for prefix in _US_SECID_PREFIXES]
    if function_name == "stock_us_daily":
        return [ref.code]
    if function_name in ("stock_zh_a_hist", "fund_etf_hist_em"):
        return [ref.code[2:] if ref.code[:2].lower() in ("sh", "sz", "bj") else ref.code]
    if function_name == "stock_zh_a_daily":
        return [ref.code.lower()]
    return [ref.code]


def _call_with_deadline(callable_: Any, deadline: float, *, source: str) -> Any:
    """Run ``callable_`` on a daemon thread, bounded by ``deadline`` seconds.

    ``stock_zh_a_hist`` is the only akshare entry point that accepts a timeout;
    the others hard-code ``timeout=15`` internally, but that is an upstream
    implementation detail we do not want to depend on.  Abandoning a daemon
    thread is the only way to keep a hung HTTP call from eating the caller's
    whole budget; it is logged so a repeatedly timing-out source is visible.
    """

    if deadline <= 0:
        raise ProviderTimeout(f"{source} 超过调用方剩余时间预算", source=source)
    box: Dict[str, Any] = {}

    def target() -> None:
        try:
            box["value"] = callable_()
        except BaseException as exc:  # noqa: BLE001 - re-raised on the caller thread
            box["error"] = exc

    thread = threading.Thread(target=target, name=f"kline-{source}", daemon=True)
    thread.start()
    thread.join(deadline)
    if thread.is_alive():
        logger.warning("%s 调用超过 %.1fs 未返回，已放弃并降级到下一数据源", source, deadline)
        raise ProviderTimeout(f"{source} 超过 {deadline:.1f}s 未返回", source=source)
    if "error" in box:
        raise box["error"]
    return box.get("value")


def _import_akshare() -> Any:
    try:
        import akshare  # noqa: PLC0415 - optional dependency, imported lazily
    except ImportError as exc:  # pragma: no cover - depends on the environment
        raise ProviderUnavailable(
            "akshare 未安装，本次请求跳过 akshare 数据源",
            source=SOURCE_EM,
            detail=str(exc),
        ) from exc
    return akshare


def _rows_from_dataframe(frame: Any) -> List[Mapping[str, Any]]:
    if frame is None:
        return []
    if hasattr(frame, "to_dict"):
        try:
            return list(frame.to_dict("records"))
        except TypeError:  # pragma: no cover - exotic frame-like object
            return []
    if isinstance(frame, Sequence):
        return [row for row in frame if isinstance(row, Mapping)]
    return []


class AkshareProvider:
    """One akshare family (``em`` or ``sina``) as a ladder tier."""

    def __init__(self, family: str = "em", *, akshare_module: Any = None) -> None:
        if family not in ("em", "sina"):
            raise ValueError(f"unknown akshare family: {family}")
        self.family = family
        self.name = SOURCE_EM if family == "em" else SOURCE_SINA
        self._module = akshare_module

    # -- routing ---------------------------------------------------------
    def _route(self, ref: SymbolRef) -> Optional[str]:
        table = EM_ROUTES if self.family == "em" else SINA_ROUTES
        return table.get((ref.market, ref.instrument))

    def supports(self, ref: SymbolRef) -> bool:
        return self._route(ref) is not None

    # -- fetch -----------------------------------------------------------
    def fetch(
        self,
        ref: SymbolRef,
        *,
        period: str = "day",
        deadline: float = 15.0,
        max_bars: int = MAX_BARS,
    ) -> Dict[str, Any]:
        function_name = self._route(ref)
        if function_name is None:
            raise ProviderDataError(
                f"{self.name} 不支持 {ref.market}/{ref.instrument}",
                source=self.name,
            )
        if self.family == "sina" and period != "day":
            raise ProviderDataError(f"{self.name} 仅支持日线", source=self.name)

        module = self._module if self._module is not None else _import_akshare()
        function = getattr(module, function_name, None)
        if function is None:  # pragma: no cover - akshare API drift
            raise ProviderDataError(
                f"akshare 缺少函数 {function_name}（版本可能已变更）",
                source=self.name,
            )

        kwargs: Dict[str, Any] = {}
        if self.family == "em":
            kwargs["period"] = PERIOD_EM.get(period, "daily")
            kwargs["adjust"] = "qfq"
        else:
            kwargs["adjust"] = "qfq"

        candidates = _symbol_candidates(function_name, ref)
        per_candidate = deadline / max(1, len(candidates))
        deadline_at = time.monotonic() + deadline
        frame: Any = None
        last_error: Optional[ProviderError] = None
        for symbol in candidates:
            budget = min(per_candidate, max(0.0, deadline_at - time.monotonic()))
            attempt_kwargs = dict(kwargs)
            attempt_kwargs["symbol"] = symbol
            if function_name == "stock_zh_a_hist":
                # the only entry point with a caller-supplied timeout
                attempt_kwargs["timeout"] = max(1.0, budget)
            started = time.monotonic()
            try:
                frame = _call_with_deadline(
                    lambda bound=attempt_kwargs: function(**bound), budget, source=self.name
                )
                break
            except ProviderError as exc:
                last_error = exc
            except Exception as exc:  # noqa: BLE001 - normalized into the provider taxonomy
                last_error = ProviderUnavailable(
                    f"{self.name} 请求失败({function_name}, symbol={symbol}): "
                    f"{type(exc).__name__}: {exc}",
                    source=self.name,
                    detail=str(exc),
                )
            finally:
                logger.debug(
                    "%s %s symbol=%s 用时 %.2fs", self.name, function_name, symbol,
                    time.monotonic() - started,
                )
        if frame is None and last_error is not None:
            raise last_error

        bars = normalize_bars(_rows_from_dataframe(frame))
        if not bars:
            raise ProviderDataError(
                f"{self.name} 未返回 {ref.raw} 的K线数据（{function_name}）",
                source=self.name,
            )
        bars = self._scale_volume(bars, ref)
        bars = bars[-max_bars:]

        return validate_payload(
            {
                "code": ref.code,
                "market": ref.market,
                "instrument": ref.instrument,
                "source": self.name,
                "adjusted": True,
                "count": len(bars),
                "data": bars,
            },
            source=self.name,
        )

    def _scale_volume(self, bars: List[Dict[str, Any]], ref: SymbolRef) -> List[Dict[str, Any]]:
        if self.family != "sina":
            return bars
        divisor = _VOLUME_DIVISOR.get(ref.instrument if ref.is_etf else ref.market)
        if not divisor:
            return bars
        for bar in bars:
            volume = bar.get("volume")
            if volume is not None:
                bar["volume"] = float(round(volume / divisor))
        return bars


_AKSHARE_AVAILABLE: Optional[bool] = None


def akshare_available(*, refresh: bool = False) -> bool:
    """True when akshare can be imported (never raises, memoized).

    Memoized because importing akshare pulls in pandas plus a JS engine and is
    far too expensive to repeat on every quote request.
    """

    global _AKSHARE_AVAILABLE
    if _AKSHARE_AVAILABLE is None or refresh:
        try:
            _import_akshare()
            _AKSHARE_AVAILABLE = True
        except ProviderError:
            _AKSHARE_AVAILABLE = False
    return _AKSHARE_AVAILABLE

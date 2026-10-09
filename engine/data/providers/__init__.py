"""K-line provider orchestration: ordered degradation with visible provenance.

Ladder (first tier that answers wins)::

    1. akshare East Money   stock_zh_a_hist / fund_etf_hist_em /
                            stock_hk_hist / stock_us_hist          adjusted=True
    2. akshare Sina         stock_zh_a_daily / stock_hk_daily /
                            stock_us_daily                          adjusted=True
    3. bundled Node script  scripts/stock-fetcher.js history
                            tencent qfq  ->  adjusted=True
                            sina raw     ->  adjusted=False (cn only)

Why Sina sits *above* the Node tier even though the Node tier is the one that
has always worked: the user asked for akshare to be the general source, and the
Sina family is qfq, so promoting it cannot change indicator semantics.  The Node
tier is kept intact as the safety net (and it is the only tier that can serve
ETF data when East Money is unreachable and Sina offers no adjusted ETF feed).

Degradation is never silent: every payload carries ``source``, ``adjusted`` and
``degraded``, an unadjusted payload additionally carries ``warnings`` and is
logged at WARNING level, and ``strict_adjust=True`` (or the
``IA_REQUIRE_ADJUSTED=1`` environment variable) turns a raw payload into an
:class:`~engine.data.providers.base.AdjustedDataUnavailable` error instead.

Timeouts are tiered rather than global: the caller's ``timeout`` is a deadline,
each tier gets a share of the *remaining* budget, and a tier that overruns its
share is abandoned so the next one still gets a chance.  Without this, one slow
upstream used to consume the whole request.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

from . import indicators as indicators_module
from .akshare_provider import SOURCE_EM, SOURCE_SINA, AkshareProvider, akshare_available
from .base import (
    MAX_BARS,
    AdjustedDataUnavailable,
    ProviderError,
    ProviderTimeout,
    ProviderUnavailable,
    ProvidersExhausted,
    SymbolNotSupported,
    SymbolRef,
    resolve_symbol,
)
from .legacy_node_provider import LegacyNodeProvider

__all__ = [
    "fetch_history",
    "resolve_symbol",
    "compute_all_indicators",
    "build_ladder",
    "MAX_BARS",
    "SOURCE_EM",
    "SOURCE_SINA",
    "AdjustedDataUnavailable",
    "ProviderError",
    "ProvidersExhausted",
    "SymbolNotSupported",
]

logger = logging.getLogger("ai-trading-automation.data.providers")

#: Absolute floor so a tier is never given an unusable slice of the budget.
_TIER_FLOOR_SECONDS = 3.0

WARNING_UNADJUSTED = (
    "数据来源为不复权(原始)行情：均线/MACD/动量/波动率及回测结果与 qfq 前复权口径不可比，"
    "请勿据此做出投资决策"
)


def strict_adjust_default() -> bool:
    """``IA_REQUIRE_ADJUSTED`` lets operators forbid raw data globally."""

    return str(os.environ.get("IA_REQUIRE_ADJUSTED", "")).strip().lower() in ("1", "true", "yes", "on")


def build_ladder(
    ref: SymbolRef,
    *,
    period: str = "day",
    use_akshare: Optional[bool] = None,
) -> List[Any]:
    """Return the ordered list of tiers that can serve ``ref``."""

    available = akshare_available() if use_akshare is None else bool(use_akshare)
    ladder: List[Any] = []
    if available:
        for family in ("em", "sina"):
            tier = AkshareProvider(family)
            if tier.supports(ref):
                ladder.append(tier)
    node = LegacyNodeProvider()
    if node.supports(ref):
        ladder.append(node)
    return ladder


def fetch_history(
    symbol: str,
    *,
    period: str = "day",
    lookback: int = 0,
    timeout: float = 50.0,
    adjust: str = "qfq",
    allow_degraded: bool = True,
    strict_adjust: Optional[bool] = None,
    max_bars: int = MAX_BARS,
    ladder: Optional[Sequence[Any]] = None,
) -> Dict[str, Any]:
    """Fetch a daily/weekly/monthly K-line series through the tier ladder.

    Returns the unified payload documented in :mod:`engine.data.providers.base`
    plus ``count``/``data`` semantics identical to the legacy fetcher: ``count``
    is the number of bars the *source* holds, while ``data`` is truncated to the
    last ``lookback + 1`` bars when ``lookback > 0``.

    Raises :class:`ProvidersExhausted` when every tier fails (with a per-tier
    reason list), :class:`SymbolNotSupported` for an unresolvable symbol, and
    :class:`AdjustedDataUnavailable` in strict mode when only raw data exists.
    """

    ref = resolve_symbol(symbol)
    if period not in ("day", "weekly", "monthly"):
        raise ProviderError(f"不支持的周期: {period}", source="orchestrator")
    if adjust != "qfq":
        # Every tier requests qfq: the Node script has it hard-coded and the
        # Sina family only exposes adjusted series in that flavour.  Refusing
        # anything else is deliberate — silently honouring ``hfq``/``""`` would
        # mislabel the payload's ``adjusted`` field.
        raise ProviderError(
            f"暂不支持的复权方式: {adjust!r}（当前仅支持 qfq 前复权）", source="orchestrator"
        )

    strict = strict_adjust_default() if strict_adjust is None else bool(strict_adjust)
    tiers = list(ladder) if ladder is not None else build_ladder(ref, period=period)
    if not tiers:
        raise ProvidersExhausted(symbol, [("resolver", ProviderUnavailable("没有可用的数据源", source="orchestrator"))])

    deadline = time.monotonic() + max(1.0, float(timeout))
    attempts: List[Tuple[str, ProviderError]] = []
    degraded_note: Optional[Tuple[str, ProviderError]] = None

    for index, tier in enumerate(tiers):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            attempts.append(
                (getattr(tier, "name", "tier"), ProviderTimeout("调用方时间预算已耗尽", source=getattr(tier, "name", "tier")))
            )
            continue
        # Equal split of what is left: the last tier therefore inherits the
        # entire remaining budget, and a slow tier can never starve the rest.
        budget = max(_TIER_FLOOR_SECONDS, remaining / (len(tiers) - index))
        budget = min(budget, remaining)
        started = time.monotonic()
        try:
            payload = tier.fetch(ref, period=period, deadline=budget, max_bars=max_bars)
        except ProviderError as exc:
            attempts.append((getattr(tier, "name", "tier"), exc))
            logger.info("K线数据源 %s 失败，降级到下一个源: %s", getattr(tier, "name", "tier"), exc)
            continue
        except Exception as exc:  # noqa: BLE001 - a tier must never break the ladder
            wrapped = ProviderUnavailable(
                f"{getattr(tier, 'name', 'tier')} 未预期错误: {type(exc).__name__}: {exc}",
                source=getattr(tier, "name", "tier"),
            )
            attempts.append((getattr(tier, "name", "tier"), wrapped))
            continue

        adjusted = bool(payload.get("adjusted"))
        source = str(payload.get("source") or getattr(tier, "name", "tier"))
        if not adjusted and strict:
            raise AdjustedDataUnavailable(symbol, source, attempts)
        if not adjusted and not allow_degraded:
            degraded_note = (source, ProviderUnavailable("不允许使用不复权数据", source=source))
            continue

        payload = _finalize(
            payload,
            ref=ref,
            symbol=symbol,
            lookback=lookback,
            period=period,
            max_bars=max_bars,
            attempts=attempts,
            elapsed_ms=int((time.monotonic() - started) * 1000),
            skipped_degraded=degraded_note is not None,
        )
        return payload

    if degraded_note is not None:
        # The only usable answer was raw data and the caller forbade it.
        attempts.append(degraded_note)
    raise ProvidersExhausted(symbol, attempts)


def _finalize(
    payload: Dict[str, Any],
    *,
    ref: SymbolRef,
    symbol: str,
    lookback: int,
    period: str,
    max_bars: int,
    attempts: Sequence[Tuple[str, ProviderError]],
    elapsed_ms: int,
    skipped_degraded: bool,
) -> Dict[str, Any]:
    data = list(payload.get("data") or [])[-max_bars:]
    adjusted = bool(payload.get("adjusted"))
    warnings: List[str] = []
    if not adjusted:
        warnings.append(WARNING_UNADJUSTED)
        logger.warning(
            "K线降级为不复权数据 symbol=%s source=%s；指标/回测口径与 qfq 不一致",
            symbol,
            payload.get("source"),
        )

    full_count = len(data)
    visible = data[-lookback - 1:] if lookback and lookback > 0 else data
    indicators = indicators_module.compute_all_indicators(data)

    result: Dict[str, Any] = {
        "code": payload.get("code") or ref.code,
        "market": ref.market,
        "count": full_count,
        "data": visible,
        "indicators": indicators,
        "source": payload.get("source"),
        "adjusted": adjusted,
        "degraded": (not adjusted) or bool(attempts),
        "instrument": payload.get("instrument") or ref.instrument,
        "period": period,
        "warnings": warnings,
        "attempts": [
            {"source": source, "error": str(error)} for source, error in attempts
        ],
        "elapsed_ms": elapsed_ms,
    }
    if skipped_degraded:  # pragma: no cover - only reachable with allow_degraded=False
        result["warnings"].append("已跳过不复权数据源（allow_degraded=False）")
    return result

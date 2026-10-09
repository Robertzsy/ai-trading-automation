from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from engine.data import providers
from engine.data.providers import AdjustedDataUnavailable, ProvidersExhausted, SymbolNotSupported
from engine.subprocess_utils import decode_subprocess_output, hidden_subprocess_kwargs

ROOT = Path(__file__).resolve().parent.parent.parent
FETCHER_JS = ROOT / "scripts" / "stock-fetcher.js"

logger = logging.getLogger("ai-trading-automation.data.fetcher")


def _run_node(args: List[str], *, timeout: int = 50) -> Any:
    p = subprocess.run(
        ["node", str(FETCHER_JS)] + args,
        cwd=str(ROOT),
        capture_output=True,
        timeout=timeout,
        **hidden_subprocess_kwargs(),
    )
    stdout = decode_subprocess_output(p.stdout)
    stderr = decode_subprocess_output(p.stderr)
    if p.returncode != 0:
        raise RuntimeError(f"fetcher.js error: {stderr.strip()}")
    return json.loads(stdout)


def realtime(symbol: str, *, timeout: int = 30) -> Dict[str, Any]:
    return _run_node(["realtime", symbol], timeout=timeout)


def history(
    symbol: str,
    *,
    lookback: int = 0,
    timeout: int = 50,
    period: str = "day",
    strict_adjust: Optional[bool] = None,
    allow_degraded: bool = True,
) -> Dict[str, Any]:
    """Return the K-line series for ``symbol``.

    Backward compatible with the historical Node-only implementation: the
    ``code``/``market``/``count``/``data``/``indicators`` fields keep their
    meaning (``count`` is the number of bars the source holds, ``data`` is
    truncated to the last ``lookback + 1`` bars), and an unrecoverable provider
    failure still yields ``{"error": ...}`` instead of raising, because callers
    such as the HTTP API spread the result straight into a response.

    New fields describe where the data came from: ``source``
    (``akshare:em`` / ``akshare:sina`` / ``node:tencent`` / ``node:sina``),
    ``adjusted`` (``True`` == qfq), ``degraded``, ``instrument``, ``period``,
    ``warnings``, ``attempts`` (per-tier failure reasons) and ``elapsed_ms``.

    ``strict_adjust`` (default from ``IA_REQUIRE_ADJUSTED``) refuses to return
    raw (不复权) bars; without it a raw payload is still returned but is flagged
    in ``warnings`` and logged at WARNING level so no caller consumes it
    silently.
    """

    try:
        return providers.fetch_history(
            symbol,
            period=period,
            lookback=lookback,
            timeout=timeout,
            strict_adjust=strict_adjust,
            allow_degraded=allow_degraded,
        )
    except SymbolNotSupported as exc:
        # Legacy contract: an unknown code produced {"error": "无效代码"}.
        return {"error": str(exc)}
    except AdjustedDataUnavailable as exc:
        if strict_adjust:
            raise
        # strict mode came from the environment, not from the caller: keep the
        # legacy dict contract and explain why nothing was returned.
        return _error_payload(symbol, exc, adjusted=None)
    except ProvidersExhausted as exc:
        return _error_payload(symbol, exc, adjusted=None)
    except Exception as exc:  # noqa: BLE001 - never break a caller's request path
        logger.warning("K线获取失败 %s: %s", symbol, exc)
        return _error_payload(symbol, exc, adjusted=None)


def _error_payload(symbol: str, exc: Exception, *, adjusted: Optional[bool]) -> Dict[str, Any]:
    warnings: List[str] = []
    attempts: List[Dict[str, str]] = []
    if isinstance(exc, ProvidersExhausted):
        attempts = [{"source": source, "error": str(error)} for source, error in exc.attempts]
        warnings = [str(error) for _, error in exc.attempts]
    else:
        warnings = [str(exc)]
    logger.warning("K线获取失败 %s: %s", symbol, exc)
    return {
        "error": str(exc),
        "code": str(symbol),
        "count": 0,
        "data": [],
        "indicators": {},
        "source": None,
        "adjusted": adjusted,
        "degraded": True,
        "warnings": warnings,
        "attempts": attempts,
    }


def snapshot(symbol: str, *, timeout: int = 45) -> Dict[str, Any]:
    return _run_node(["snapshot", symbol], timeout=timeout)


def search(keyword: str, *, timeout: int = 30) -> List[Dict[str, Any]]:
    return _run_node(["search", keyword], timeout=timeout)


def market_list(market: str, *, limit: int = 0, timeout: int = 50) -> Dict[str, Any]:
    """Return a market security list; ``limit=0`` requests the full market."""

    normalized = str(market or "").strip().lower()
    if normalized not in {"cn", "hk", "us", "etf"}:
        raise ValueError(f"unsupported market: {market}")
    requested = int(limit)
    bounded_limit = max(10, min(50_000, requested)) if requested > 0 else 0
    payload = _run_node(["market-list", normalized, str(bounded_limit)], timeout=timeout)
    if not isinstance(payload, dict):
        raise RuntimeError("market-list returned a non-object response")
    if payload.get("error"):
        raise RuntimeError(str(payload["error"]))
    if not isinstance(payload.get("data"), list):
        raise RuntimeError("market-list response is missing data")
    return payload


def get_close_prices(symbol: str, lookback: int = 0) -> List[float]:
    h = history(symbol, lookback=lookback)
    data = h.get("data", [])
    prices = [float(d["close"]) for d in data if d.get("close")]
    return prices[-lookback:] if lookback else prices

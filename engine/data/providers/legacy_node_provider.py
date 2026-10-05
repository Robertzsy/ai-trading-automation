"""Fallback tier: the bundled ``scripts/stock-fetcher.js`` history command.

The JavaScript file is deliberately **not** modified (it is a shipped contract,
covered by ``tests/test_stock_fetcher_contract.py``); this module only wraps it.
That has one consequence worth spelling out.

``getTencentHistory()`` is the Node side's primary source and returns qfq
(前复权) bars — the same semantics the whole application assumes.  For A-shares
the Node script silently falls back to ``getSinaHistory()``, which returns
**raw (不复权)** bars and marks neither the payload nor the log.  A wrapper that
blindly stamped ``adjusted=True`` on whatever ``node history`` printed would
therefore reintroduce exactly the silent-corruption bug this task is about.

The two Node serializers emit the *same* keys in *different insertion order*
(JavaScript preserves property order, and ``json.loads`` preserves document
order), which is the only in-band signal available without editing the script:

===============  ================================================
Tencent (qfq)    ``date, open, close, high, low, volume``
Sina (raw)       ``date, open, high, low, close, volume``
===============  ================================================

:func:`detect_legacy_subsource` uses that order to label the payload
``node:tencent``/``adjusted=True`` or ``node:sina``/``adjusted=False``.  The
heuristic is covered by a test that feeds both real serializers' output; if a
future edit to the JavaScript changes the key order, that test fails rather
than the labelling silently flipping.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from engine.subprocess_utils import decode_subprocess_output, hidden_subprocess_kwargs

from .base import (
    MAX_BARS,
    ProviderDataError,
    ProviderTimeout,
    ProviderUnavailable,
    SymbolRef,
    normalize_bars,
    validate_payload,
)

ROOT = Path(__file__).resolve().parents[3]
FETCHER_JS = ROOT / "scripts" / "stock-fetcher.js"

SOURCE_TENCENT = "node:tencent"
SOURCE_SINA = "node:sina"

#: Bar key order produced by ``getTencentHistory()`` (qfq) in stock-fetcher.js.
TENCENT_BAR_KEYS: Tuple[str, ...] = ("date", "open", "close", "high", "low", "volume")
#: Bar key order produced by ``getSinaHistory()`` (raw) in stock-fetcher.js.
SINA_BAR_KEYS: Tuple[str, ...] = ("date", "open", "high", "low", "close", "volume")


def detect_legacy_subsource(bar_keys: Sequence[str]) -> Tuple[str, bool]:
    """Map a legacy bar's key order to ``(source, adjusted)``."""

    keys = tuple(bar_keys)
    if keys == SINA_BAR_KEYS:
        return SOURCE_SINA, False
    return SOURCE_TENCENT, True


def _bar_keys(payload: Mapping[str, Any]) -> Tuple[str, ...]:
    for bar in payload.get("data") or []:
        if isinstance(bar, Mapping):
            return tuple(bar.keys())
    return ()


class LegacyNodeProvider:
    """``node scripts/stock-fetcher.js history`` as a ladder tier."""

    name = "node"

    def __init__(self, *, script: Path = FETCHER_JS, runner: Any = None) -> None:
        self.script = script
        self._runner = runner

    def supports(self, ref: SymbolRef) -> bool:
        return ref.market in ("cn", "hk", "us")

    # -- subprocess ------------------------------------------------------
    def _default_runner(self, args: List[str], timeout: float) -> Any:
        try:
            completed = subprocess.run(
                ["node", str(self.script)] + args,
                cwd=str(ROOT),
                capture_output=True,
                timeout=max(1.0, timeout),
                **hidden_subprocess_kwargs(),
            )
        except FileNotFoundError as exc:  # pragma: no cover - node missing
            raise ProviderUnavailable("未找到 node 可执行文件", source=self.name, detail=str(exc)) from exc
        except subprocess.TimeoutExpired as exc:
            raise ProviderTimeout(
                f"{self.name} 子进程超过 {timeout:.0f}s 未返回", source=self.name, detail=str(exc)
            ) from exc
        stdout = decode_subprocess_output(completed.stdout)
        stderr = decode_subprocess_output(completed.stderr)
        if completed.returncode != 0:
            raise ProviderUnavailable(
                f"{self.name} 退出码 {completed.returncode}: {stderr.strip()[:400]}",
                source=self.name,
            )
        if not stdout.strip():
            raise ProviderDataError(f"{self.name} 未输出数据", source=self.name)
        try:
            return json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise ProviderDataError(
                f"{self.name} 输出不是合法 JSON: {stdout[:200]}", source=self.name, detail=str(exc)
            ) from exc

    # -- fetch -----------------------------------------------------------
    def fetch(
        self,
        ref: SymbolRef,
        *,
        period: str = "day",
        deadline: float = 20.0,
        max_bars: int = MAX_BARS,
    ) -> Dict[str, Any]:
        # ``option`` is the Node script's period keyword; omitting it means
        # "day, full history".  The bar *count* is deliberately never passed:
        # the legacy script slices ``data`` itself and reports the untruncated
        # ``count``, and providers here always return the full series so the
        # orchestrator can apply ``lookback`` uniformly for every source.
        args = ["history", ref.raw]
        if period in ("weekly", "monthly"):
            args.append(period)
        runner = self._runner or self._default_runner
        payload = runner(args, deadline)
        if not isinstance(payload, Mapping):
            raise ProviderDataError(f"{self.name} 返回非对象数据", source=self.name)
        if payload.get("error"):
            raise ProviderDataError(
                f"{self.name}: {payload['error']}", source=self.name, detail=str(payload["error"])
            )

        source, adjusted = detect_legacy_subsource(_bar_keys(payload))
        bars = normalize_bars(payload.get("data") or [])
        if not bars:
            raise ProviderDataError(
                f"{self.name} 未返回 {ref.raw} 的K线数据", source=self.name
            )
        bars = bars[-max_bars:]
        return validate_payload(
            {
                "code": payload.get("code") or ref.code,
                "market": ref.market,
                "instrument": ref.instrument,
                "source": source,
                "adjusted": adjusted,
                "count": len(bars),
                "data": bars,
            },
            source=source,
        )


def run_legacy_history(
    symbol: str,
    *,
    period: str = "day",
    timeout: float = 20.0,
) -> Optional[Dict[str, Any]]:
    """Convenience wrapper used by tests and diagnostics."""

    from .base import resolve_symbol

    ref = resolve_symbol(symbol)
    return LegacyNodeProvider().fetch(ref, period=period, deadline=timeout)

"""Screening preview helper: the command surface behind ``RUN_SCREENING``.

AI Trading Automation 2.0 keeps the deterministic screening engine and exposes it
as one small, dependency-light entry point used by the CLI, the HTTP command
API, and the DSH tools bridge.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Mapping, Optional, Sequence
from zoneinfo import ZoneInfo

from engine.config import cfg


def _snapshot_loader(symbols: Sequence[str], limit: int) -> tuple[Dict[str, Any], Dict[str, str]]:
    """Fetch a snapshot for EVERY requested symbol, with ``limit`` workers.

    The second argument is the concurrency budget (``market_data_workers``),
    not a row count: slicing here silently scored only the first few candidates
    and made the factor ranking meaningless. Order is preserved so callers can
    still reason about the candidate list deterministically.
    """
    from concurrent.futures import ThreadPoolExecutor

    from engine.data import fetcher

    ordered = [str(symbol) for symbol in symbols if str(symbol)]
    workers = max(1, int(limit or 1))

    def load(symbol: str):
        try:
            return symbol, fetcher.snapshot(symbol), None
        except Exception as exc:  # noqa: BLE001 - one failing symbol must not kill the run
            return symbol, None, str(exc)[:200]

    snapshots: Dict[str, Any] = {}
    errors: Dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for symbol, payload, error in pool.map(load, ordered):
            if error is not None:
                errors[symbol] = error
            elif payload is not None:
                snapshots[symbol] = payload
    return snapshots, errors


def run_screening_preview(
    market: str,
    *,
    symbols: Optional[Sequence[str]] = None,
    now: Optional[datetime] = None,
    conditions: Optional[Sequence[Mapping[str, Any]]] = None,
) -> Dict[str, Any]:
    """Run a screening pass and return the dashboard-ready preview."""
    from engine.portfolio import account as account_store
    from engine.screening.engine import run_screening

    normalized = str(market or "").strip().lower()
    if normalized not in {"cn", "hk", "us", "etf"}:
        raise ValueError("market 必须是 cn、hk、us 或 etf")
    if now is None:
        now = datetime.now(ZoneInfo(cfg.schedule.get("timezone", "Asia/Shanghai")))
    account_data = account_store.account(normalized)
    held = [str(holding.get("code", "")) for holding in account_data.get("holdings", []) if holding.get("code")]
    configured = list(symbols or [])
    fallback = list((cfg.optimizer.get("default_symbols") or {}).get(normalized, []))
    outcome = run_screening(
        normalized,
        held_symbols=held,
        configured_symbols=configured,
        fallback_symbols=fallback,
        settings=dict(cfg.screening),
        autonomous_config=dict(cfg.autonomous),
        snapshot_loader=_snapshot_loader,
        now=now,
        conditions=conditions,
    )
    return {
        "market": normalized,
        "selected_symbols": outcome.audit["research_symbols"],
        "research_symbols": outcome.audit["research_symbols"],
        "candidate_symbols": outcome.audit["candidate_symbols"],
        "holding_symbols": held,
        "snapshots": outcome.snapshots,
        "market_data_errors": outcome.market_data_errors,
        "audit": outcome.audit,
        "generated_at": now.isoformat(timespec="seconds"),
    }

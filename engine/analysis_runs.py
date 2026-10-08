"""Durable progress and checkpoints for DSH-native investment workflows.

The Python engine does not make AI decisions.  It only persists the state
reported by the fixed DSH workflow, so a crashed headless session can resume
from the last completed stage and the product UI can show truthful progress.
"""
from __future__ import annotations

import copy
import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from engine import analysis_events
from engine.atomic_write import write_text_atomic
from engine.paths import runtime_dir

_lock = threading.RLock()
_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$")
_MARKETS = {"cn", "hk", "us", "etf"}
_TERMINAL = {"completed", "failed"}
#: Statuses that end a round's life. ``cancelled`` is user-initiated (the stop
#: button); ``ready_for_execution`` is terminal for ANALYSIS but may still be
#: advanced by an approved submission, so it is deliberately NOT in this set.
_TERMINAL_OR_CANCELLED = {"completed", "failed", "cancelled"}

#: Record schema version. v1 had counters only; v2 adds the stage timeline,
#: per-subagent identity and a bounded log ring. Readers must accept both.
RUN_VERSION = 2


def _directory() -> Path:
    path = runtime_dir() / "analysis_runs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _cycle_id(value: Any) -> str:
    cycle_id = str(value or "").strip()
    if not _ID_RE.fullmatch(cycle_id):
        raise ValueError("cycle_id 必须是 1-120 位字母、数字、点、下划线或短横线")
    return cycle_id


def _market(value: Any) -> str:
    market = str(value or "").strip().lower()
    if market not in _MARKETS:
        raise ValueError("market 必须是 cn、hk、us 或 etf")
    return market


def _path(cycle_id: str) -> Path:
    return _directory() / f"{_cycle_id(cycle_id)}.json"


def _read(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _write(path: Path, payload: Mapping[str, Any]) -> None:
    # Pollers read this exact file while workers checkpoint it, so the write has
    # to tolerate a transient share violation (unique temp name + bounded retry;
    # see engine.atomic_write).
    write_text_atomic(
        path,
        json.dumps(payload, ensure_ascii=False, indent=2, default=str),
    )


def start_or_resume(payload: Mapping[str, Any], *, retry_failed: bool = False) -> Dict[str, Any]:
    """Create a run, or return its durable state when the id already exists.

    A workflow posting ``/api/analysis/runs/start`` may not silently reopen a
    failure. Only the round orchestrator passes ``retry_failed=True`` after it
    has acquired the cycle lease, preventing a second headless call from
    changing ``failed`` back to ``running`` while the original owner exits.
    """
    cycle_id = _cycle_id(payload.get("cycle_id"))
    market = _market(payload.get("market"))
    with _lock:
        path = _path(cycle_id)
        existing = _read(path)
        if existing is not None:
            if existing.get("market") != market:
                raise ValueError("cycle_id 已被其他市场使用")
            if existing.get("status") == "ready_for_execution":
                # Analysis finished; only the submission step may advance it.
                return copy.deepcopy(existing)
            if existing.get("status") == "failed" and retry_failed:
                existing["status"] = "running"
                existing["current_stage"] = "resuming"
                existing.pop("error", None)
                # A new attempt must replace the previous failure report.
                existing.pop("report_meta", None)
                existing["completed_at"] = None
                existing["updated_at"] = _now()
                _write(path, existing)
            return copy.deepcopy(existing)
        symbols = []
        for item in payload.get("symbols", []) if isinstance(payload.get("symbols"), list) else []:
            symbol = str(item).strip()
            if symbol and symbol not in symbols:
                symbols.append(symbol)
        symbols_source = str(payload.get("symbols_source") or "").strip().lower()
        if symbols_source not in {"user", "screening", "autonomous"}:
            # Legacy records and older callers had no source; infer it from
            # the presence of explicit symbols so stored runs stay truthful.
            symbols_source = "user" if symbols else "autonomous"
        expected_agents = payload.get("expected_agents", 0)
        if not isinstance(expected_agents, int) or isinstance(expected_agents, bool) or expected_agents < 0:
            raise ValueError("expected_agents 必须是非负整数")
        now = _now()
        run = {
            "version": RUN_VERSION,
            "cycle_id": cycle_id,
            "market": market,
            "label": str(payload.get("label") or "analysis")[:80],
            "status": "running",
            "current_stage": "preparing",
            "symbols": symbols,
            "symbols_source": symbols_source,
            "submit": bool(payload.get("submit", False)),
            "holding_symbols": [
                str(item).strip()
                for item in (payload.get("holding_symbols", []) if isinstance(payload.get("holding_symbols"), list) else [])
                if str(item).strip()
            ],
            "expected_agents": expected_agents,
            "started_agents": 0,
            "completed_agents": 0,
            "failed_agents": 0,
            "evidence_count": 0,
            "checkpoints": {},
            # ── v2 timeline (additive) ────────────────────────────────────
            "stages": {},
            "agents": {},
            "logs": [],
            "goal_id": str(payload.get("goal_id") or "")[:120] or None,
            "report": None,
            "warnings": [],
            "started_at": now,
            "updated_at": now,
            "completed_at": None,
        }
        _write(path, run)
        return copy.deepcopy(run)


def update(payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Update live counters or persist one completed stage checkpoint.

    v1 semantics are preserved exactly (the three counters and ``checkpoints``);
    v2 additionally records the stage timeline so the product UI can show how
    long each stage took. Stage timing is derived here — server side — so a
    caller that omits timestamps still produces a truthful timeline.
    """
    cycle_id = _cycle_id(payload.get("cycle_id"))
    with _lock:
        path = _path(cycle_id)
        run = _read(path)
        if run is None:
            raise KeyError(f"analysis run not found: {cycle_id}")
        if run.get("status") in _TERMINAL_OR_CANCELLED:
            return copy.deepcopy(run)
        analysis_events.ensure_shape(run)
        stage = str(payload.get("stage") or run.get("current_stage") or "running").strip()[:80]
        event = str(payload.get("event") or "checkpoint").strip().lower()
        run["current_stage"] = stage
        now = _now()
        stages: Dict[str, Any] = run["stages"]
        stage_state = stages.get(stage)
        if not isinstance(stage_state, dict):
            stage_state = {
                "status": "running", "started_at": now, "finished_at": None,
                "duration_ms": None, "agents_total": 0, "agents_done": 0,
                "agents_failed": 0, "result_digest": None,
            }
            stages[stage] = stage_state
        if not stage_state.get("started_at"):
            stage_state["started_at"] = now
        if event == "execution_ready":
            # The fixed workflow has persisted its final decisions: analysis is
            # done, trading is now possible (autonomous submit=true) or
            # pending user approval (manual). The engine computes the decision
            # fingerprint here so the later submission can verify "exactly
            # these decisions" with the same canonicalization.
            from engine.trading.decision_execution import decision_fingerprint

            decisions = payload.get("decisions")
            run["status"] = "ready_for_execution"
            run["current_stage"] = "ready_for_execution"
            run["decisions"] = decisions if isinstance(decisions, list) else []
            run["decision_fingerprint"] = decision_fingerprint(run.get("market", ""), run.get("decisions", []))
            checkpoints = run.setdefault("checkpoints", {})
            checkpoints[stage] = {
                "status": "completed",
                "completed_at": now,
                "agents_started": int(payload.get("agents_started", 0) or 0),
                "result": payload.get("result"),
            }
            _end_stage(stage_state, "completed", now, payload.get("result"))
        elif event == "agent_start":
            run["started_agents"] = int(run.get("started_agents", 0)) + 1
        elif event == "agent_end":
            outcome = str(payload.get("outcome") or "completed").lower()
            if outcome == "completed":
                run["completed_agents"] = int(run.get("completed_agents", 0)) + 1
                stage_state["agents_done"] = int(stage_state.get("agents_done", 0) or 0) + 1
            else:
                run["failed_agents"] = int(run.get("failed_agents", 0)) + 1
                stage_state["agents_failed"] = int(stage_state.get("agents_failed", 0) or 0) + 1
        elif event == "checkpoint":
            result = payload.get("result")
            checkpoints = run.setdefault("checkpoints", {})
            checkpoints[stage] = {
                "status": "completed",
                "completed_at": now,
                "agents_started": int(payload.get("agents_started", 0) or 0),
                "result": result,
            }
            evidence_count = payload.get("evidence_count")
            if isinstance(evidence_count, int) and not isinstance(evidence_count, bool) and evidence_count >= 0:
                run["evidence_count"] = max(int(run.get("evidence_count", 0)), evidence_count)
            _end_stage(stage_state, "completed", now, result)
        elif event == "stage_start":
            stage_state["status"] = "running"
        else:
            raise ValueError("event 必须是 stage_start、agent_start、agent_end 或 checkpoint")
        run["updated_at"] = now
        _write(path, run)
        return copy.deepcopy(run)


def _end_stage(stage_state: Dict[str, Any], status: str, at: str, result: Any = None) -> None:
    """Close a stage with a measured duration and an honest result digest."""
    stage_state["status"] = status
    stage_state["finished_at"] = at
    started = stage_state.get("started_at")
    if isinstance(started, str):
        measured = analysis_events.ms_between(started, at)
        if measured is not None:
            stage_state["duration_ms"] = measured
    digest = analysis_events.digest_from_result(result)
    if digest is not None:
        stage_state["result_digest"] = digest


def apply_event(payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Fold one fine-grained event (subagent identity / log / stage) into a run.

    Used by ``POST /api/analysis/runs/events``.  Kept separate from ``update()``
    on purpose: ``update()`` carries checkpoint semantics and is intentionally
    inert on terminal runs, whereas late-arriving subagent events must still be
    recorded so a finished round's timeline is complete.
    """
    cycle_id = _cycle_id(payload.get("cycle_id"))
    with _lock:
        path = _path(cycle_id)
        run = _read(path)
        if run is None:
            raise KeyError(f"analysis run not found: {cycle_id}")
        if run.get("status") == "cancelled":
            return copy.deepcopy(run)
        analysis_events.ensure_shape(run)
        analysis_events.apply_event(run, payload)
        run["updated_at"] = _now()
        _write(path, run)
        return copy.deepcopy(run)


def cancel(cycle_id: str, *, reason: str = "") -> Dict[str, Any]:
    """Mark a round cancelled by the user.

    Analysis-only, so there is nothing to roll back: no order was ever placed
    (web rounds force ``submit=False``).  The worker observes the status change
    and stops; the cycle lease is released by the worker's ``finally``.
    """
    normalized = _cycle_id(cycle_id)
    with _lock:
        path = _path(normalized)
        run = _read(path)
        if run is None:
            raise KeyError(f"analysis run not found: {normalized}")
        status = str(run.get("status", ""))
        if status in _TERMINAL_OR_CANCELLED:
            return copy.deepcopy(run)
        now = _now()
        run["status"] = "cancelled"
        run["current_stage"] = "cancelled"
        run["cancelled_at"] = now
        run["updated_at"] = now
        run["completed_at"] = now
        run["error"] = str(reason or "用户手动停止分析")[:2000]
        analysis_events.ensure_shape(run)
        for stage_state in (run.get("stages") or {}).values():
            if isinstance(stage_state, dict) and stage_state.get("status") == "running":
                _end_stage(stage_state, "cancelled", now)
        # Late child-end events are ignored for cancelled rounds, so close the
        # live rows here rather than leaving the timeline showing running work.
        for agent in (run.get("agents") or {}).values():
            if isinstance(agent, dict) and agent.get("status") == "running":
                agent["status"] = "cancelled"
                agent["finished_at"] = now
                agent["duration_ms"] = analysis_events.ms_between(agent.get("started_at"), now)
        analysis_events.append_log(
            run, message=str(reason or "用户手动停止分析"), level="warn", at=now,
        )
        _write(path, run)
        return copy.deepcopy(run)


def is_cancelled(cycle_id: str) -> bool:
    """Cheap check used by the round worker between stages."""
    try:
        run = get(cycle_id)
    except (KeyError, ValueError):
        return False
    return bool(run) and run.get("status") == "cancelled"


def set_report_meta(cycle_id: str, descriptor: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
    """Attach the per-round report descriptor to a run (idempotent).

    The report is generated once, after the round reaches a terminal state, so
    this deliberately does not touch status/stage fields.
    """
    normalized = _cycle_id(cycle_id)
    with _lock:
        path = _path(normalized)
        run = _read(path)
        if run is None:
            return None
        if run.get("report_meta"):
            return copy.deepcopy(run)
        run["report_meta"] = dict(descriptor or {})
        run["updated_at"] = _now()
        _write(path, run)
        return copy.deepcopy(run)


def finish(payload: Mapping[str, Any], *, failed: bool = False) -> Dict[str, Any]:
    cycle_id = _cycle_id(payload.get("cycle_id"))
    with _lock:
        path = _path(cycle_id)
        run = _read(path)
        if run is None:
            raise KeyError(f"analysis run not found: {cycle_id}")
        if str(run.get("status")) == "cancelled":
            # A cancelled round is already terminal; a late worker must not
            # resurrect it into completed/failed.
            return copy.deepcopy(run)
        analysis_events.ensure_shape(run)
        now = _now()
        run["status"] = "failed" if failed else "completed"
        run["current_stage"] = "failed" if failed else "completed"
        if failed:
            run["error"] = str(payload.get("error") or "analysis workflow failed")[:2000]
            analysis_events.append_log(
                run, message=run["error"], level="error", at=now,
            )
        else:
            # ``report`` keeps its v1 meaning (a path string) for compatibility;
            # the v2 structured descriptor lives in ``report_meta``.
            for key in ("decisions", "execution", "report", "audit_file"):
                if key in payload:
                    run[key] = payload[key]
        warnings = payload.get("warnings")
        if isinstance(warnings, list):
            run["warnings"] = [str(item)[:500] for item in warnings[:50]]
        final_status = "failed" if failed else "completed"
        for stage_state in (run.get("stages") or {}).values():
            if isinstance(stage_state, dict) and stage_state.get("status") == "running":
                _end_stage(
                    stage_state,
                    final_status,
                    now,
                )
        run["updated_at"] = now
        run["completed_at"] = now
        _write(path, run)
        return copy.deepcopy(run)


def get(cycle_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        payload = _read(_path(cycle_id))
        return copy.deepcopy(payload) if payload is not None else None


def list_runs(*, market: str = "", limit: int = 20) -> list[Dict[str, Any]]:
    normalized_market = _market(market) if market else ""
    limit = max(1, min(100, int(limit)))
    with _lock:
        rows = []
        for path in _directory().glob("*.json"):
            payload = _read(path)
            if payload is None or (normalized_market and payload.get("market") != normalized_market):
                continue
            rows.append(payload)
        rows.sort(key=lambda row: str(row.get("updated_at") or ""), reverse=True)
        return copy.deepcopy(rows[:limit])


def latest(*, market: str = "") -> Optional[Dict[str, Any]]:
    rows = list_runs(market=market, limit=1)
    return rows[0] if rows else None


def stale_after(run: Mapping[str, Any], *, seconds: int = 1800) -> bool:
    """Whether a running run is likely orphaned (no update for `seconds`).

    Used by the async round service to decide between "the round is still
    alive elsewhere" and "the worker died and a retry may resume it".
    """
    if str(run.get("status", "")) != "running":
        return False
    updated = str(run.get("updated_at") or "")
    if not updated:
        return False
    try:
        stamp = datetime.fromisoformat(updated)
    except ValueError:
        return False
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - stamp).total_seconds() > seconds

"""Fine-grained analysis-run events (stage / subagent timeline).

The DSH workflow emits ``workflow/agent-start`` and ``workflow/agent-end`` with
a SECOND argument carrying the child's identity:

    workflow/agent-start -> (info: {id, meta}, agent: {seq, label, phase?, childId})
    workflow/agent-end   -> (info, agent & {outcome: completed|failed|cancelled})

The launcher used to forward only ``event`` and ``outcome``, so the engine could
count agents but never say WHICH subagent was running, for how long, or why it
failed.  This module folds those published identities into the durable run
record so the product UI can render a real timeline instead of a counter.

Design notes
------------
* Pure folding: no file IO, no clock reads beyond an injectable ``now``.  The
  caller (``engine.analysis_runs.apply_event``) owns persistence so the fold
  stays trivially unit-testable.
* Forward compatible: unknown events and unknown fields are ignored rather than
  rejected.  A newer DSH emitting extra agent fields must never fail a round.
* Bounded: ``logs`` is a ring buffer, ``agents`` prunes oldest finished entries.
  A 30-symbol round produces ~180 subagents; the record must stay small enough
  for a 2-second status poll.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional

#: Agent identity keys carried by the DSH workflow events.
AGENT_KEYS = ("seq", "label", "phase", "child_id")

#: Terminal outcomes published by ``workflow/agent-end``.
AGENT_OUTCOMES = {"completed", "failed", "cancelled"}

#: Ring-buffer bounds (see module docstring: the record is polled every 2s).
MAX_LOGS = 400
MAX_AGENTS = 600
MAX_LOG_MESSAGE = 500
MAX_SUMMARY = 400
MAX_ERROR = 1000

LOG_LEVELS = {"debug", "info", "warn", "error"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _text(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def ms_between(start: str, end: str) -> Optional[int]:
    """Milliseconds between two ISO timestamps, or None when unparseable."""
    return _ms_between(start, end)


def _ms_between(start: str, end: str) -> Optional[int]:
    """Milliseconds between two ISO timestamps, or None when unparseable."""
    try:
        first = datetime.fromisoformat(str(start))
        last = datetime.fromisoformat(str(end))
    except (TypeError, ValueError):
        return None
    if first.tzinfo is None:
        first = first.replace(tzinfo=timezone.utc)
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    delta = (last - first).total_seconds()
    return int(delta * 1000) if delta >= 0 else None


def agent_key(event: Mapping[str, Any], stage: str) -> str:
    """Stable identity for one ``agent()`` call.

    Prefers ``stage:label`` (readable, and what the UI shows).  Falls back to the
    DSH sequence number when the label is missing so two anonymous agents in the
    same stage never collapse into one row.
    """
    label = _text(event.get("label"), 200)
    seq = event.get("seq")
    if label:
        return f"{stage}:{label}"[:300]
    if isinstance(seq, int) and not isinstance(seq, bool):
        return f"{stage}:#{seq}"
    return f"{stage}:#unknown"


def _blank_stage() -> Dict[str, Any]:
    return {
        "status": "running",
        "started_at": None,
        "finished_at": None,
        "duration_ms": None,
        "agents_total": 0,
        "agents_done": 0,
        "agents_failed": 0,
        "result_digest": None,
    }


def _blank_agent(stage: str, event: Mapping[str, Any], at: str) -> Dict[str, Any]:
    agent: Dict[str, Any] = {
        "seq": event.get("seq") if isinstance(event.get("seq"), int) else None,
        "label": _text(event.get("label"), 200),
        "phase": _text(event.get("phase"), 120),
        "stage": stage,
        "child_id": _text(event.get("child_id"), 120),
        "status": "running",
        "started_at": at,
        "finished_at": None,
        "duration_ms": None,
        "summary": None,
        "error": None,
    }
    return agent


def _bump_counter(stage_state: Dict[str, Any], field: str) -> None:
    current = stage_state.get(field)
    stage_state[field] = (int(current) if isinstance(current, int) else 0) + 1


def _close_stage(stage_state: Dict[str, Any], status: str, at: str, digest: Any = None) -> None:
    stage_state["status"] = status
    stage_state["finished_at"] = at
    started = stage_state.get("started_at")
    if isinstance(started, str):
        measured = _ms_between(started, at)
        if measured is not None:
            stage_state["duration_ms"] = measured
    if digest is not None:
        stage_state["result_digest"] = digest


def _prune_agents(run: Dict[str, Any]) -> None:
    """Drop oldest FINISHED agents first; never drop a running one."""
    agents: Dict[str, Any] = run.get("agents") or {}
    if len(agents) <= MAX_AGENTS:
        return
    overflow = len(agents) - MAX_AGENTS
    finished = [
        key for key, value in agents.items()
        if isinstance(value, Mapping) and value.get("status") != "running"
    ]
    finished.sort(key=lambda key: str((agents.get(key) or {}).get("finished_at") or ""))
    for key in finished[:overflow]:
        agents.pop(key, None)


def ensure_shape(run: Dict[str, Any]) -> Dict[str, Any]:
    """Additive migration to the v2 timeline shape (v1 records stay readable)."""
    if not isinstance(run.get("stages"), dict):
        run["stages"] = {}
    if not isinstance(run.get("agents"), dict):
        run["agents"] = {}
    if not isinstance(run.get("logs"), list):
        run["logs"] = []
    return run


def append_log(run: Dict[str, Any], *, message: str, level: str = "info",
               stage: str = "", agent: str = "", at: str = "") -> None:
    """Append one ring-buffered log line."""
    text = _text(message, MAX_LOG_MESSAGE)
    if not text:
        return
    logs: List[Any] = run.setdefault("logs", [])
    if not isinstance(logs, list):
        logs = []
        run["logs"] = logs
    logs.append({
        "at": at or _now(),
        "level": level if level in LOG_LEVELS else "info",
        "stage": _text(stage, 80),
        "agent": _text(agent, 200),
        "message": text,
    })
    if len(logs) > MAX_LOGS:
        del logs[: len(logs) - MAX_LOGS]


def apply_event(run: Dict[str, Any], event: Mapping[str, Any], *,
                at: str = "") -> Dict[str, Any]:
    """Fold one analysis event into ``run`` (mutates in place) and return it.

    Handled events: ``stage_start``, ``stage_end``, ``agent_start``,
    ``agent_end``, ``log``, ``heartbeat``.  Unknown events are ignored.
    """
    ensure_shape(run)
    at = at or _now()
    name = _text(event.get("event"), 40).lower()
    stage = _text(event.get("stage"), 80) or _text(run.get("current_stage"), 80) or "running"
    stages: Dict[str, Any] = run["stages"]
    stage_state = stages.get(stage)
    if not isinstance(stage_state, dict):
        stage_state = _blank_stage()
        stages[stage] = stage_state

    if name == "stage_start":
        if not stage_state.get("started_at"):
            stage_state["started_at"] = at
        stage_state["status"] = "running"
        run["current_stage"] = stage
        return run

    if name == "stage_end":
        status = _text(event.get("status"), 20).lower() or "completed"
        if status not in {"completed", "failed", "cancelled"}:
            status = "completed"
        if not stage_state.get("started_at"):
            stage_state["started_at"] = at
        _close_stage(stage_state, status, at, event.get("result_digest"))
        return run

    if name == "agent_start":
        key = agent_key(event, stage)
        existing = run["agents"].get(key)
        if not isinstance(existing, dict):
            run["agents"][key] = _blank_agent(stage, event, at)
            _bump_counter(stage_state, "agents_total")
            run["started_agents"] = int(run.get("started_agents", 0) or 0) + 1
        elif existing.get("status") != "running":
            # A retry of the same label reuses the row instead of double counting.
            existing.update({
                "status": "running", "started_at": at,
                "finished_at": None, "duration_ms": None, "error": None,
            })
            _bump_counter(stage_state, "agents_total")
            run["started_agents"] = int(run.get("started_agents", 0) or 0) + 1
        if not stage_state.get("started_at"):
            stage_state["started_at"] = at
        run["current_stage"] = stage
        _prune_agents(run)
        return run

    if name == "agent_end":
        key = agent_key(event, stage)
        outcome = _text(event.get("outcome"), 20).lower()
        if outcome not in AGENT_OUTCOMES:
            outcome = "completed"
        agent = run["agents"].get(key)
        if not isinstance(agent, dict):
            # An end without a start (late subscriber / replayed event): synthesize.
            agent = _blank_agent(stage, event, at)
            run["agents"][key] = agent
            _bump_counter(stage_state, "agents_total")
            run["started_agents"] = int(run.get("started_agents", 0) or 0) + 1
        agent["status"] = outcome
        agent["finished_at"] = at
        started = agent.get("started_at")
        if isinstance(started, str):
            measured = _ms_between(started, at)
            if measured is not None:
                agent["duration_ms"] = measured
        summary = event.get("summary")
        if summary is not None and agent.get("summary") is None:
            agent["summary"] = _text(summary, MAX_SUMMARY) or None
        error = event.get("error")
        if outcome == "failed":
            agent["error"] = _text(error, MAX_ERROR) or "子任务失败（未提供原因）"
            _bump_counter(stage_state, "agents_failed")
            run["failed_agents"] = int(run.get("failed_agents", 0) or 0) + 1
        elif outcome == "completed":
            _bump_counter(stage_state, "agents_done")
            run["completed_agents"] = int(run.get("completed_agents", 0) or 0) + 1
        _prune_agents(run)
        return run

    if name == "log":
        append_log(
            run,
            message=_text(event.get("message"), MAX_LOG_MESSAGE),
            level=_text(event.get("level"), 10).lower() or "info",
            stage=stage,
            agent=_text(event.get("label"), 200),
            at=at,
        )
        return run

    if name == "heartbeat":
        # Only refreshes liveness; ``updated_at`` is owned by the persistence layer.
        return run

    return run


def digest_from_result(result: Any) -> Optional[Dict[str, Any]]:
    """Small, honest summary of a stage result for the timeline."""
    if result is None:
        return None
    if isinstance(result, list):
        return {"kind": "list", "items": len(result)}
    if isinstance(result, Mapping):
        digest: Dict[str, Any] = {"kind": "object", "keys": len(result)}
        for key in ("symbols_ok", "symbols_failed", "evidence_count"):
            if key in result:
                digest[key] = result[key]
        return digest
    return {"kind": type(result).__name__}

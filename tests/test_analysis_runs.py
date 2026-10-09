"""Tests for durable DSH workflow progress and checkpoint resume."""
from __future__ import annotations

import json
import threading

import pytest

from engine import analysis_runs


@pytest.fixture(autouse=True)
def isolated_runs(monkeypatch, tmp_path):
    monkeypatch.setattr(analysis_runs, "runtime_dir", lambda: tmp_path / "runtime")


def test_run_checkpoints_resume_and_complete():
    started = analysis_runs.start_or_resume({
        "cycle_id": "20260822-cn-auto",
        "market": "cn",
        "label": "auto",
        "symbols": ["600519", "000858", "600519"],
        "holding_symbols": ["600519"],
        "expected_agents": 22,
    })
    assert started["symbols"] == ["600519", "000858"]

    analysis_runs.update({"cycle_id": started["cycle_id"], "stage": "base_research", "event": "agent_start"})
    analysis_runs.update({"cycle_id": started["cycle_id"], "stage": "base_research", "event": "agent_end", "outcome": "completed"})
    checkpointed = analysis_runs.update({
        "cycle_id": started["cycle_id"],
        "stage": "base_research",
        "event": "checkpoint",
        "agents_started": 8,
        "evidence_count": 12,
        "result": [{"symbol": "600519"}],
    })
    assert checkpointed["checkpoints"]["base_research"]["result"][0]["symbol"] == "600519"
    assert checkpointed["evidence_count"] == 12
    resumed = analysis_runs.start_or_resume({"cycle_id": started["cycle_id"], "market": "cn"})
    assert resumed["checkpoints"] == checkpointed["checkpoints"]

    completed = analysis_runs.finish({"cycle_id": started["cycle_id"], "decisions": [], "execution": {"fills": []}})
    assert completed["status"] == "completed"
    assert analysis_runs.latest(market="cn")["cycle_id"] == started["cycle_id"]


def test_evidence_registry_and_policy_survive_failed_round_resume():
    analysis_runs.start_or_resume({"cycle_id": "evidence-resume", "market": "hk"})
    registry = [{"id": "E-quote", "symbol": "00700", "source": "investment_market_snapshot", "data_version": "v1"}]
    analysis_runs.update({"cycle_id": "evidence-resume", "stage": "base_research", "event": "checkpoint",
                          "result": [], "evidence_registry": registry, "tool_policy": {"upstream": 4}})
    analysis_runs.finish({"cycle_id": "evidence-resume", "error": "later failure"}, failed=True)
    resumed = analysis_runs.start_or_resume({"cycle_id": "evidence-resume", "market": "hk"}, retry_failed=True)
    checkpoint = resumed["checkpoints"]["base_research"]
    assert checkpoint["evidence_registry"] == registry
    assert checkpoint["tool_policy"]["upstream"] == 4
    assert list(resumed["checkpoints"]) == ["base_research"]


def test_malformed_evidence_registry_is_not_checkpointed():
    analysis_runs.start_or_resume({"cycle_id": "bad-registry", "market": "hk"})
    with pytest.raises(ValueError, match="evidence_registry"):
        analysis_runs.update({"cycle_id": "bad-registry", "stage": "base_research", "event": "checkpoint",
                              "result": [], "evidence_registry": [{"source": "missing-id"}]})
    assert not analysis_runs.get("bad-registry")["checkpoints"]


def test_failed_run_only_reopens_for_authorized_orchestrator_retry():
    analysis_runs.start_or_resume({"cycle_id": "resume-us", "market": "us"})
    analysis_runs.update({"cycle_id": "resume-us", "stage": "base_research", "event": "checkpoint", "result": {"ok": True}})
    analysis_runs.finish({"cycle_id": "resume-us", "error": "network"}, failed=True)
    unchanged = analysis_runs.start_or_resume({"cycle_id": "resume-us", "market": "us"})
    assert unchanged["status"] == "failed"
    assert unchanged["error"] == "network"

    resumed = analysis_runs.start_or_resume(
        {"cycle_id": "resume-us", "market": "us"},
        retry_failed=True,
    )
    assert resumed["status"] == "running"
    assert resumed["current_stage"] == "resuming"
    assert resumed["checkpoints"]["base_research"]["result"] == {"ok": True}


def test_execution_ready_persists_decisions_and_fingerprint():
    analysis_runs.start_or_resume({
        "cycle_id": "ready-cn",
        "market": "cn",
        "symbols": ["688981"],
        "symbols_source": "user",
    })
    decisions = [{"symbol": "688981", "action": "BUY", "target_weight": 0.05, "confidence": 0.9}]
    ready = analysis_runs.update({
        "cycle_id": "ready-cn",
        "stage": "final_decision",
        "event": "execution_ready",
        "decisions": decisions,
        "warnings": ["共享取证归档未写入；本轮数据追溯不完整"],
    })
    assert ready["status"] == "ready_for_execution"
    assert ready["current_stage"] == "ready_for_execution"
    assert ready["decisions"] == decisions
    assert ready["warnings"] == ["共享取证归档未写入；本轮数据追溯不完整"]
    assert ready["decision_fingerprint"]

    from engine.trading.decision_execution import decision_fingerprint

    assert ready["decision_fingerprint"] == decision_fingerprint("cn", decisions)
    # Reordering the same decisions does not change the identity.
    reordered = list(reversed(decisions))
    assert decision_fingerprint("cn", reordered) == ready["decision_fingerprint"]
    # A changed weight DOES change it.
    tampered = [{**decisions[0], "target_weight": 0.3}]
    assert decision_fingerprint("cn", tampered) != ready["decision_fingerprint"]

    # ready_for_execution is terminal for analysis: start_or_resume replays it.
    again = analysis_runs.start_or_resume({"cycle_id": "ready-cn", "market": "cn"})
    assert again["status"] == "ready_for_execution"
    assert again["warnings"] == ready["warnings"]


def test_symbols_source_is_recorded():
    run = analysis_runs.start_or_resume({
        "cycle_id": "source-cn",
        "market": "cn",
        "symbols": ["688981"],
        "symbols_source": "user",
    })
    assert run["symbols_source"] == "user"
    run2 = analysis_runs.start_or_resume({"cycle_id": "source-auto", "market": "cn"})
    assert run2["symbols_source"] == "autonomous"


def test_updates_are_atomic_under_concurrency():
    analysis_runs.start_or_resume({"cycle_id": "parallel-etf", "market": "etf", "expected_agents": 20})
    threads = [threading.Thread(target=analysis_runs.update, args=({"cycle_id": "parallel-etf", "stage": "base_research", "event": "agent_start"},)) for _ in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    run = analysis_runs.get("parallel-etf")
    assert run["started_agents"] == 20
    # The on-disk file must always remain valid JSON.
    path = analysis_runs._directory() / "parallel-etf.json"
    assert json.loads(path.read_text(encoding="utf-8"))["started_agents"] == 20


@pytest.mark.parametrize("cycle_id", ["", "../escape", "bad/name", "x" * 121])
def test_rejects_unsafe_cycle_ids(cycle_id):
    with pytest.raises(ValueError):
        analysis_runs.start_or_resume({"cycle_id": cycle_id, "market": "cn"})

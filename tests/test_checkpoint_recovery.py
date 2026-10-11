"""Offline regression for paid research lost to checkpoint/transport failures."""
import json
import os
import time

import pytest

from engine import analysis_runs, analysis_reports
from engine import runtime_lock


@pytest.fixture(autouse=True)
def isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(analysis_runs, "runtime_dir", lambda: tmp_path / "runtime")
    monkeypatch.setattr(analysis_reports, "_analysis_dir", lambda: tmp_path / "runtime/analysis_runs")


def checkpoint():
    analysis_runs.start_or_resume({"cycle_id": "recovery", "market": "cn", "symbols": ["600519"]})
    return {"cycle_id": "recovery", "stage": "base_research", "result": [{"summary": "compact"}],
            "archives": {"base_research": [{"summary": "完整证据" * 100_000}]}, "agents_started": 80}


def test_crash_after_atomic_stage_save_recovers_without_research(monkeypatch):
    payload = checkpoint()
    original = analysis_runs._write
    def interrupted(path, body):
        if path == analysis_runs._path("recovery"):
            raise OSError("progress projection unavailable")
        return original(path, body)
    monkeypatch.setattr(analysis_runs, "_write", interrupted)
    with pytest.raises(OSError):
        analysis_runs.commit_checkpoint(payload)
    assert analysis_reports.read_archived_stage("recovery", "base_research") == payload["archives"]["base_research"]
    monkeypatch.setattr(analysis_runs, "_write", original)
    restored = analysis_runs.start_or_resume({"cycle_id": "recovery", "market": "cn"})
    assert restored["checkpoints"]["base_research"]["result"] == payload["result"]
    assert restored["checkpoints"]["base_research"]["agents_started"] == 80


def test_same_commit_is_idempotent_but_different_results_are_rejected():
    payload = checkpoint()
    first = analysis_runs.commit_checkpoint(payload)
    assert analysis_runs.commit_checkpoint(payload)["checkpoints"] == first["checkpoints"]
    payload["archives"]["base_research"] = []
    with pytest.raises(ValueError, match="覆盖"):
        analysis_runs.commit_checkpoint(payload)


def test_raw_archive_without_commit_is_not_assumed_complete():
    checkpoint()
    analysis_reports.archive_stage_results("recovery", {"base_research": ["possibly partial"]})
    assert not analysis_runs.start_or_resume({"cycle_id": "recovery", "market": "cn"})["checkpoints"]


def test_corrupt_commit_stops_recovery_instead_of_recomputing():
    payload = checkpoint()
    analysis_runs.commit_checkpoint(payload)
    path = analysis_runs._directory() / "archive/recovery/base_research.checkpoint.json"
    path.write_text("broken", encoding="utf-8")
    with pytest.raises(ValueError, match="损坏"):
        analysis_runs.start_or_resume({"cycle_id": "recovery", "market": "cn"})


def test_live_cycle_owner_is_not_stolen_when_timestamp_is_old(tmp_path):
    path = tmp_path / "cycle.lease"
    owner = runtime_lock.AtomicClaim(path, check_owner=True, stale_seconds=1)
    assert owner.acquire()
    os.utime(path, (time.time()-3600, time.time()-3600))
    try:
        assert not runtime_lock.AtomicClaim(path, check_owner=True, stale_seconds=1).acquire()
    finally:
        owner.release()


def test_dead_cycle_owner_is_recovered_without_hour_long_wait(tmp_path, monkeypatch):
    path = tmp_path / "cycle.lease"
    path.write_text("pid=999999 time=0", encoding="ascii")
    monkeypatch.setattr(runtime_lock, "_pid_alive", lambda _: False)
    claim = runtime_lock.AtomicClaim(path, check_owner=True)
    assert claim.acquire()
    claim.release()

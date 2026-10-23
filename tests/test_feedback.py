"""Tests for the round feedback loop and its weekly aggregation."""
from __future__ import annotations

import json
from datetime import datetime, timedelta

from engine import feedback, paths


def _run(cycle_id: str = "20261017-hk-manual-test", *, started_minutes_ago: int = 60):
    started = datetime.now().astimezone() - timedelta(minutes=started_minutes_ago)
    return {
        "cycle_id": cycle_id,
        "market": "hk",
        "label": "manual",
        "status": "ready_for_execution",
        "symbols": ["00700", "09988"],
        "symbols_source": "screening",
        "started_at": started.isoformat(timespec="seconds"),
        "completed_at": (started + timedelta(minutes=13)).isoformat(timespec="seconds"),
        "evidence_count": 264,
        "expected_agents": 38,
        "started_agents": 38,
        "completed_agents": 38,
        "failed_agents": 0,
        "screening": {
            "generated_at": (started - timedelta(minutes=40)).isoformat(timespec="seconds"),
            "source": "sina-market-center",
            "selected_count": 4,
        },
        "decisions": [
            {
                "symbol": "00700",
                "action": "HOLD",
                "confidence": 0.6,
                "target_weight": 0.0,
                "reason": "置信度 0.60 低于 0.65；amount=0 使流动性无法核验",
            },
            {
                "symbol": "09988",
                "action": "BUY",
                "confidence": 0.72,
                "target_weight": 0.05,
                "reason": "证据充分",
            },
        ],
        "execution": {"fills": [], "rejected": [{"symbol": "09988", "reason": "liquidity"}]},
        "model_usage": {"totals": {"total_tokens": 1000}},
        "warnings": [],
    }


def test_write_round_feedback_records_buckets_and_screening_age(monkeypatch, tmp_path):
    monkeypatch.setattr(paths, "runtime_dir", lambda: tmp_path / "runtime")
    feedback.write_round_feedback(_run())
    path = tmp_path / "runtime" / "opt-feedback" / "round-20261017-hk-manual-test.json"
    assert path.exists()
    row = json.loads(path.read_text(encoding="utf-8"))
    assert row["screening"]["age_minutes_at_start"] == 40.0
    assert row["screening"]["selected_count"] == 4
    assert "confidence" in row["hold_reason_buckets"]
    assert "data_gap" in row["hold_reason_buckets"]
    assert row["execution"] == {"fills": 0, "rejected": 1}
    assert row["duration_seconds"] == 780.0


def test_metrics_aggregates_confidence_and_execution(monkeypatch, tmp_path):
    monkeypatch.setattr(paths, "runtime_dir", lambda: tmp_path / "runtime")
    feedback.write_round_feedback(_run())
    data = feedback.metrics(7, min_confidence=0.65)
    assert data["rounds"] == 1
    assert data["decisions"] == 2
    assert data["buys"] == 1
    assert data["fills"] == 0
    assert data["execution_rate"] == 0.0
    assert data["confidence"]["count"] == 2
    assert data["confidence"]["below_threshold"] == 1
    assert data["confidence"]["threshold"] == 0.65
    assert data["screening_age_minutes"]["stale_rounds"] == 1


def test_metrics_empty_state(monkeypatch, tmp_path):
    monkeypatch.setattr(paths, "runtime_dir", lambda: tmp_path / "runtime")
    assert feedback.metrics(7)["rounds"] == 0
    assert "没有已完成的轮次记录" in feedback.weekly_summary(7)


def test_weekly_summary_mentions_tracked_signals(monkeypatch, tmp_path):
    monkeypatch.setattr(paths, "runtime_dir", lambda: tmp_path / "runtime")
    feedback.write_round_feedback(_run())
    text = feedback.weekly_summary(7)
    assert "自优化周报" in text
    assert "执行率" in text
    assert "选股新鲜度" in text
    assert "confidence" in text
    assert "20261017-hk-manual-test" in text

def test_data_quality_log_and_metrics(monkeypatch, tmp_path):
    import json as _json
    from datetime import datetime, timezone
    monkeypatch.setattr(paths, "runtime_dir", lambda: tmp_path / "runtime")
    feedback.write_round_feedback(_run())
    log = tmp_path / "runtime" / "opt-feedback" / "data-quality.jsonl"
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    rows = [
        {"at": now, "symbol": "00700", "market": "hk", "initial_gaps": ["amount", "pe"], "remaining_gaps": [], "sources": ["miaoxiang"], "filled": True},
        {"at": now, "symbol": "09988", "market": "hk", "initial_gaps": ["amount"], "remaining_gaps": ["amount"], "sources": [], "filled": False},
    ]
    log.write_text("\n".join(_json.dumps(row, ensure_ascii=False) for row in rows) + "\n", encoding="utf-8")
    data = feedback.metrics(7)
    quality = data["data_quality"]
    assert quality["snapshots"] == 2
    assert quality["with_remaining_gaps"] == 1
    assert quality["gap_rate"] == 0.5
    assert quality["filled"] == 1
    assert quality["sources"] == {"miaoxiang": 1}
    assert "数据缺口率" in feedback.weekly_summary(7)

def test_recommendations_capped_and_metric_driven(monkeypatch, tmp_path):
    import json as _json
    from datetime import datetime
    monkeypatch.setattr(paths, "runtime_dir", lambda: tmp_path / "runtime")
    feedback.write_round_feedback(_run())
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    log = tmp_path / "runtime" / "opt-feedback" / "data-quality.jsonl"
    log.write_text(
        "\n".join(
            _json.dumps({"at": now, "symbol": "00700", "market": "hk", "initial_gaps": ["amount"], "remaining_gaps": ["amount"], "sources": [], "filled": False}, ensure_ascii=False)
            for _ in range(2)
        ) + "\n",
        encoding="utf-8",
    )
    data = feedback.metrics(7)
    advice = feedback.recommendations(data)
    assert 0 < len(advice) <= 3
    assert any("数据源" in item for item in advice)
    text = feedback.weekly_summary(7)
    assert "1. " in text and "需人工确认" in text

def test_finish_writes_feedback_without_worker(monkeypatch, tmp_path):
    from engine import analysis_runs
    monkeypatch.setattr(paths, "runtime_dir", lambda: tmp_path / "runtime")
    monkeypatch.setattr(analysis_runs, "runtime_dir", lambda: tmp_path / "runtime")
    analysis_runs.start_or_resume({
        "cycle_id": "20261017-hk-manual-finish",
        "market": "hk",
        "label": "manual",
        "symbols": ["00700"],
        "symbols_source": "screening",
        "screening": {"generated_at": "2026-10-17T17:00:00+08:00", "source": "sina-market-center", "selected_count": 4},
    })
    analysis_runs.finish({
        "cycle_id": "20261017-hk-manual-finish",
        "decisions": [{"symbol": "00700", "action": "HOLD", "confidence": 0.6, "reason": "置信度不足"}],
    })
    path = tmp_path / "runtime" / "opt-feedback" / "round-20261017-hk-manual-finish.json"
    assert path.exists()
    row = json.loads(path.read_text(encoding="utf-8"))
    assert row["status"] == "completed"
    assert row["screening"]["selected_count"] == 4
    assert row["decisions"][0]["confidence"] == 0.6

def test_metrics_counts_each_hold_decision(monkeypatch, tmp_path):
    import json as _json
    import os
    monkeypatch.setattr(paths, "runtime_dir", lambda: tmp_path / "runtime")
    directory = tmp_path / "runtime" / "opt-feedback"
    directory.mkdir(parents=True)
    legacy = {
        "cycle_id": "20261017-hk-legacy",
        "market": "hk",
        "status": "ready_for_execution",
        "started_at": "2026-10-17T17:00:00+08:00",
        "completed_at": "2026-10-17T17:13:00+08:00",
        "hold_reason_buckets": ["confidence"],
        "decisions": [
            {"symbol": "00700", "action": "HOLD", "confidence": 0.6, "reason_bucket": "confidence"},
            {"symbol": "09988", "action": "HOLD", "confidence": 0.63, "reason_bucket": "confidence"},
            {"symbol": "02513", "action": "HOLD", "confidence": 0.58, "reason_bucket": "confidence"},
            {"symbol": "01810", "action": "HOLD", "confidence": 0.68, "reason_bucket": "price_zone"},
        ],
    }
    (directory / "round-20261017-hk-legacy.json").write_text(_json.dumps(legacy), encoding="utf-8")
    data = feedback.metrics(7)
    assert data["hold_reason_buckets"] == {"confidence": 3, "price_zone": 1}
    assert data["decisions"] == 4

def test_write_records_hold_reason_counts(monkeypatch, tmp_path):
    monkeypatch.setattr(paths, "runtime_dir", lambda: tmp_path / "runtime")
    feedback.write_round_feedback(_run())
    import json as _json
    row = _json.loads((tmp_path / "runtime" / "opt-feedback" / "round-20261017-hk-manual-test.json").read_text(encoding="utf-8"))
    assert row["hold_reason_counts"]["confidence"] == 1
    assert row["hold_reason_counts"]["data_gap"] == 1

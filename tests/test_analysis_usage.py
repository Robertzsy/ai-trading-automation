import json
import pytest
from engine import analysis_runs


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    monkeypatch.setattr(analysis_runs, "runtime_dir", lambda: tmp_path)
    analysis_runs.start_or_resume({"cycle_id": "usage", "market": "hk"})


def send(request_id="r", usage=None, **fields):
    return analysis_runs.apply_event({"cycle_id": "usage", "event": "model_usage", "request": {
        "request_id": request_id, "channel": "chat", "model": "test", "usage": usage, **fields}})


def test_unknown_is_not_zero_and_delivery_is_idempotent():
    send(usage={"input_tokens": 100, "output_tokens": 20, "cache_read_tokens": 80, "uncached_input_tokens": 20})
    run = send(usage={"input_tokens": 100, "output_tokens": 20, "cache_read_tokens": 80, "uncached_input_tokens": 20})
    assert run["model_usage"]["totals"]["requests"] == 1
    assert run["model_usage"]["totals"]["cache_hit_pct"] == 80
    run = send("missing")
    assert run["model_usage"]["totals"]["coverage"] == "partial"
    assert run["model_usage"]["totals"]["unknown_usage_requests"] == 1
    assert run["model_usage"]["totals"]["cache_hit_pct"] is None


def test_usage_survives_finish_and_does_not_appear_as_a_separate_run():
    analysis_runs.finish({"cycle_id": "usage", "decisions": []})
    run = send(usage={"input_tokens": 5, "output_tokens": 8}, channel="native_search", label="00700:news_analyst")
    assert run["status"] == "completed"
    assert run["model_usage"]["totals"]["total_tokens"] == 13
    assert len(analysis_runs.list_runs()) == 1
    ledger = json.loads((analysis_runs._directory() / "usage" / "usage.json").read_text(encoding="utf-8"))
    assert ledger["requests"]["r"]["channel"] == "native_search"


def test_cancelled_calls_can_still_have_billable_usage():
    analysis_runs.cancel("usage")
    run = send(usage={"input_tokens": 2, "output_tokens": 3})
    assert run["status"] == "cancelled"
    assert run["model_usage"]["totals"]["total_tokens"] == 5


def test_invalid_counts_and_missing_ids_cannot_claim_complete_metering():
    assert send(usage={"input_tokens": -1, "output_tokens": 3})["model_usage"]["totals"]["coverage"] == "partial"
    with pytest.raises(ValueError, match="request_id"):
        send("")
    with pytest.raises(ValueError, match="exceeds"):
        send("bad", {"input_tokens": 3, "output_tokens": 1, "cache_read_tokens": 4})
    with pytest.raises(ValueError, match="object"):
        analysis_runs.apply_event({"cycle_id": "usage", "event": "model_usage", "request": ["bad"]})


def test_telemetry_gaps_remain_visible_after_late_usage_arrives():
    analysis_runs.apply_event({"cycle_id": "usage", "event": "model_usage_status", "telemetry": {"pending_usage_events": 2, "unattributed_requests": 1}})
    run = send(usage={"input_tokens": 2, "output_tokens": 3})
    assert run["model_usage"]["telemetry"]["pending_usage_events"] == 2
    assert run["model_usage"]["request_coverage"] == "observed_requests"

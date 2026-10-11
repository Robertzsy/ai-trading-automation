from engine import analysis_runs


def test_thinking_marker_survives_final_checkpoint(tmp_path, monkeypatch):
    monkeypatch.setattr(analysis_runs, "_directory", lambda: tmp_path)
    analysis_runs.start_or_resume({"cycle_id": "thinking-check", "market": "hk", "symbols": ["00700"]})
    for event in ["checkpoint", "execution_ready"]:
        run = analysis_runs.update({"cycle_id": "thinking-check", "stage": "final_decision", "event": event,
                                   "research_thinking": "fast-news-technical-v1", "result": {}, "decisions": []})
        assert run["checkpoints"]["final_decision"]["research_thinking"] == "fast-news-technical-v1"

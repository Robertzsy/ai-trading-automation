"""Fine-grained analysis timeline + per-round report tests.

These cover the two capabilities whose absence made progress invisible and
per-round reports non-existent:

* ``engine.analysis_events`` — folding DSH ``workflow/agent-*`` events
  (which carry ``seq``/``label``/``phase``/``childId``) into a durable timeline.
* ``engine.analysis_reports`` — generating, indexing and safely reading the
  per-round markdown report, plus the untruncated stage archive.

All tests are offline and deterministic (no network, no real DSH process).
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from engine import analysis_events, analysis_reports, analysis_runs


@pytest.fixture()
def runtime(tmp_path, monkeypatch):
    """Isolate every runtime path the two modules use.

    ``analysis_runs._directory`` and ``analysis_reports._reports_dir`` are
    resolved on every call, so both must be patched — otherwise state leaks
    between tests through the real project ``runtime/`` directory.
    """
    root = tmp_path / "runtime"

    def _analysis_dir():
        path = root / "analysis_runs"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _reports_dir():
        path = root / "reports"
        path.mkdir(parents=True, exist_ok=True)
        return path

    monkeypatch.setattr(analysis_runs, "_directory", _analysis_dir)
    monkeypatch.setattr(analysis_reports, "_reports_dir", _reports_dir)
    monkeypatch.setattr(analysis_reports, "_analysis_dir", _analysis_dir)
    # Legacy callers resolve runtime_dir() directly; keep them inside the sandbox.
    monkeypatch.setattr(analysis_runs, "runtime_dir", lambda: root, raising=False)
    monkeypatch.setattr(analysis_reports, "runtime_dir", lambda: root, raising=False)
    return root


_CYCLE_SEQ = {"n": 0}


def _run(cycle_id=None, **extra):
    """Create a run with a unique id per call (avoids cross-test collisions)."""
    if cycle_id is None:
        _CYCLE_SEQ["n"] += 1
        cycle_id = f"20260901-cn-manual-t{_CYCLE_SEQ['n']:03d}"
    payload = {
        "cycle_id": cycle_id, "market": "cn", "label": "manual",
        "symbols": ["600519"], "symbols_source": "user", "expected_agents": 6,
    }
    payload.update(extra)
    return analysis_runs.start_or_resume(payload)


# ── analysis_events: the timeline fold ────────────────────────────────────────

def test_agent_events_record_identity_and_duration(runtime):
    """The published label/phase/childId must survive into the durable record."""
    cycle = _run()["cycle_id"]
    analysis_runs.apply_event({
        "cycle_id": cycle, "stage": "base_research", "event": "agent_start",
        "seq": 3, "label": "600519:technical_analyst", "phase": "基础研究",
        "child_id": "sess-abc",
    })
    run = analysis_runs.get(cycle)
    key = "base_research:600519:technical_analyst"
    assert key in run["agents"], "agent row must be keyed by stage:label"
    agent = run["agents"][key]
    assert agent["seq"] == 3
    assert agent["phase"] == "基础研究"
    assert agent["child_id"] == "sess-abc"
    assert agent["status"] == "running"
    assert run["stages"]["base_research"]["agents_total"] == 1

    analysis_runs.apply_event({
        "cycle_id": cycle, "stage": "base_research", "event": "agent_end",
        "seq": 3, "label": "600519:technical_analyst", "outcome": "completed",
        "summary": "趋势向上",
    })
    run = analysis_runs.get(cycle)
    agent = run["agents"][key]
    assert agent["status"] == "completed"
    assert agent["summary"] == "趋势向上"
    assert agent["finished_at"] is not None
    assert isinstance(agent["duration_ms"], int) and agent["duration_ms"] >= 0
    assert run["stages"]["base_research"]["agents_done"] == 1
    assert run["completed_agents"] == 1


def test_two_agents_in_one_stage_stay_distinct(runtime):
    """A stage with 4 parallel role agents must not collapse into one row."""
    cycle = _run()["cycle_id"]
    for role in ("technical_analyst", "fundamentals_analyst", "news_analyst", "sentiment_analyst"):
        analysis_runs.apply_event({
            "cycle_id": cycle, "stage": "base_research", "event": "agent_start",
            "label": f"600519:{role}", "phase": "基础研究",
        })
    run = analysis_runs.get(cycle)
    assert len(run["agents"]) == 4
    assert run["stages"]["base_research"]["agents_total"] == 4
    assert run["started_agents"] == 4


def test_agent_without_label_falls_back_to_seq(runtime):
    """Anonymous agents must still be individually addressable."""
    cycle = _run()["cycle_id"]
    analysis_runs.apply_event({"cycle_id": cycle, "stage": "risk_review", "event": "agent_start", "seq": 7})
    analysis_runs.apply_event({"cycle_id": cycle, "stage": "risk_review", "event": "agent_start", "seq": 8})
    run = analysis_runs.get(cycle)
    assert "risk_review:#7" in run["agents"]
    assert "risk_review:#8" in run["agents"]


def test_failed_agent_records_error_and_counter(runtime):
    cycle = _run()["cycle_id"]
    analysis_runs.apply_event({
        "cycle_id": cycle, "stage": "research_debate", "event": "agent_start",
        "label": "600519:bull-r1", "phase": "研究辩论",
    })
    analysis_runs.apply_event({
        "cycle_id": cycle, "stage": "research_debate", "event": "agent_end",
        "label": "600519:bull-r1", "outcome": "failed", "error": "模型超时",
    })
    run = analysis_runs.get(cycle)
    agent = run["agents"]["research_debate:600519:bull-r1"]
    assert agent["status"] == "failed"
    assert agent["error"] == "模型超时"
    assert run["failed_agents"] == 1
    assert run["stages"]["research_debate"]["agents_failed"] == 1


def test_agent_end_without_start_is_synthesized(runtime):
    """A late subscriber or replayed event must not lose the row."""
    cycle = _run()["cycle_id"]
    analysis_runs.apply_event({
        "cycle_id": cycle, "stage": "final_decision", "event": "agent_end",
        "label": "portfolio-manager", "outcome": "completed",
    })
    run = analysis_runs.get(cycle)
    assert run["agents"]["final_decision:portfolio-manager"]["status"] == "completed"
    assert run["started_agents"] == 1


def test_unknown_event_is_ignored_not_fatal(runtime):
    """Forward compatibility: a newer DSH must never break a round."""
    cycle = _run()["cycle_id"]
    analysis_runs.apply_event({"cycle_id": cycle, "stage": "base_research", "event": "something_new"})
    assert analysis_runs.get(cycle)["status"] == "running"


def test_log_ring_buffer_is_bounded(runtime):
    run = {"logs": []}
    for index in range(analysis_events.MAX_LOGS + 50):
        analysis_events.append_log(run, message=f"line {index}")
    assert len(run["logs"]) == analysis_events.MAX_LOGS
    assert run["logs"][-1]["message"] == f"line {analysis_events.MAX_LOGS + 49}"


def test_checkpoint_records_stage_timing(runtime):
    """Stage duration is derived server-side from the timeline."""
    cycle = _run()["cycle_id"]
    analysis_runs.update({"cycle_id": cycle, "stage": "base_research", "event": "stage_start"})
    state = analysis_runs.get(cycle)["stages"]["base_research"]
    assert state["status"] == "running"
    assert state["started_at"] is not None

    analysis_runs.update({
        "cycle_id": cycle, "stage": "base_research", "event": "checkpoint",
        "result": {"symbols_ok": 1, "symbols_failed": 0}, "agents_started": 4,
    })
    state = analysis_runs.get(cycle)["stages"]["base_research"]
    assert state["status"] == "completed"
    assert state["finished_at"] is not None
    assert isinstance(state["duration_ms"], int) and state["duration_ms"] >= 0
    assert state["result_digest"] == {"kind": "object", "keys": 2, "symbols_ok": 1, "symbols_failed": 0}


def test_v1_record_without_timeline_is_readable(runtime):
    """Records written before v2 must not break any read path."""
    cycle = _run()["cycle_id"]
    path = analysis_runs._path(cycle)
    legacy = json.loads(path.read_text(encoding="utf-8"))
    for key in ("stages", "agents", "logs", "report", "goal_id"):
        legacy.pop(key, None)
    legacy["version"] = 1
    path.write_text(json.dumps(legacy, ensure_ascii=False), encoding="utf-8")

    loaded = analysis_runs.get(cycle)
    assert loaded["version"] == 1
    # Reading is safe...
    assert analysis_runs.latest(market="cn")["cycle_id"] == cycle
    # ...and the next write upgrades the shape additively.
    analysis_runs.apply_event({"cycle_id": cycle, "stage": "base_research", "event": "agent_start", "label": "x"})
    upgraded = analysis_runs.get(cycle)
    assert upgraded["agents"]["base_research:x"]["status"] == "running"


def test_cancel_is_terminal_and_marks_running_stage(runtime):
    from engine import analysis_events as events

    cycle = _run()["cycle_id"]
    analysis_runs.apply_event({"cycle_id": cycle, "stage": "base_research", "event": "agent_start", "label": "a"})
    cancelled = analysis_runs.cancel(cycle, reason="用户点击停止")
    assert cancelled["status"] == "cancelled"
    assert cancelled["current_stage"] == "cancelled"
    assert cancelled["stages"]["base_research"]["status"] == "cancelled"
    assert analysis_runs.is_cancelled(cycle) is True
    # A late worker must not resurrect it.
    analysis_runs.finish({"cycle_id": cycle, "decisions": []})
    assert analysis_runs.get(cycle)["status"] == "cancelled"
    assert any("停止" in entry["message"] for entry in analysis_runs.get(cycle)["logs"])
    assert events is analysis_events


def test_finish_closes_dangling_stages(runtime):
    cycle = _run()["cycle_id"]
    analysis_runs.apply_event({"cycle_id": cycle, "stage": "risk_review", "event": "stage_start"})
    analysis_runs.finish({"cycle_id": cycle, "decisions": []})
    run = analysis_runs.get(cycle)
    assert run["status"] == "completed"
    assert run["stages"]["risk_review"]["status"] != "running"
    assert run["stages"]["risk_review"]["duration_ms"] is not None


def test_ms_between_handles_bad_input(runtime):
    assert analysis_events.ms_between("nonsense", "also nonsense") is None
    start = datetime(2026, 9, 1, tzinfo=timezone.utc)
    end = start + timedelta(seconds=90)
    assert analysis_events.ms_between(start.isoformat(), end.isoformat()) == 90_000


# ── analysis_reports: generation, index, safe read ────────────────────────────

def _completed_run(runtime, cycle="20260901-cn-manual-rep"):
    _run(cycle_id=cycle)
    analysis_runs.update({"cycle_id": cycle, "stage": "base_research", "event": "stage_start"})
    analysis_runs.update({
        "cycle_id": cycle, "stage": "base_research", "event": "checkpoint",
        "result": {"symbols_ok": 1}, "agents_started": 4, "evidence_count": 7,
    })
    analysis_runs.apply_event({
        "cycle_id": cycle, "stage": "base_research", "event": "agent_start",
        "label": "600519:technical_analyst", "phase": "基础研究",
    })
    analysis_runs.apply_event({
        "cycle_id": cycle, "stage": "base_research", "event": "agent_end",
        "label": "600519:technical_analyst", "outcome": "completed", "summary": "趋势向上",
    })
    analysis_runs.update({
        "cycle_id": cycle, "stage": "final_decision", "event": "execution_ready",
        "decisions": [{
            "symbol": "600519", "action": "HOLD", "target_weight": 0.0,
            "confidence": 0.5, "reason": "证据不足", "evidence_ids": ["e1"],
        }],
    })
    return analysis_runs.get(cycle)


def test_round_report_is_generated_named_and_indexed(runtime):
    run = _completed_run(runtime)
    descriptor = analysis_reports.generate(run)
    assert "error" not in descriptor, descriptor
    report = analysis_reports.round_report_path(run)
    assert report.is_file()
    # Per-round reports are addressable by cycle id — that is the whole point.
    assert run["cycle_id"] in report.name
    assert report.stat().st_size > 500

    body = report.read_text(encoding="utf-8")
    assert "分析轮次报告" in body
    assert "阶段时间线" in body
    assert "子任务明细" in body
    assert "600519:technical_analyst" in body
    assert "本报告未执行交易" in body
    assert "submit=false" in body

    rows = analysis_reports.read_index()
    assert [row["cycle_id"] for row in rows] == [run["cycle_id"]]
    assert rows[0]["report_file"] == report.name


def test_report_by_cycle_id_returns_body(runtime):
    run = _completed_run(runtime)
    analysis_reports.generate(run)
    payload = analysis_reports.read_report_content(cycle_id=run["cycle_id"])
    assert payload["file"].endswith(".md")
    assert "分析轮次报告" in payload["content"]


def test_report_read_rejects_path_traversal(runtime):
    """A crafted file name must never escape the reports directory."""
    _completed_run(runtime)
    for evil in ("../../etc/passwd", "..\\..\\secrets.md", "a/b.md", "x.md.bak", "report.txt"):
        with pytest.raises((ValueError, KeyError)):
            analysis_reports.read_report_content(file=evil)


def test_missing_report_raises_keyerror(runtime):
    with pytest.raises(KeyError):
        analysis_reports.read_report_content(cycle_id="does-not-exist")
    with pytest.raises(KeyError):
        analysis_reports.read_report_content(file="20260101-cn-none.md")
    with pytest.raises(ValueError):
        analysis_reports.read_report_content()


def test_archive_preserves_untruncated_stage_results(runtime):
    """Q4-B: the workflow truncates to 1600 chars, the archive must not."""
    run = _completed_run(runtime)
    long_text = "证" * 5000
    descriptor = analysis_reports.generate(run, stage_results={"base_research": {"blob": long_text}})
    assert descriptor["archive_dir"]
    archived = list((runtime / "analysis_runs" / "archive" / run["cycle_id"]).glob("*.json"))
    assert len(archived) == 1
    payload = json.loads(archived[0].read_text(encoding="utf-8"))
    assert len(payload["blob"]) == 5000, "archive must keep the full payload"
    assert f"archive" in descriptor["archive_dir"]


def test_goal_section_renders_completion_and_deviation(runtime):
    run = _completed_run(runtime)
    run["goal_id"] = "goal-1"
    goal = {
        "goal_id": "goal-1", "title": "稳健增值", "status": "active",
        "horizon": {"kind": "deadline", "until": "2026-12-01"},
        "sub_goals": [{
            "id": "G3", "title": "决策置信度", "priority": 3,
            "metric": {"name": "mean_decision_confidence", "op": ">=", "target": 0.7, "unit": "ratio"},
        }],
    }
    history = {
        "cycle_id": run["cycle_id"], "weighted_score": 0.72,
        "per_sub_goal": {"G3": {"actual": 0.61, "met": False, "score": 0.0}},
        "deviation": ["G3 低于阈值 0.09"],
        "next_focus": ["提升证据引用密度"],
        "stop_decision": "continue",
    }
    descriptor = analysis_reports.generate(run, goal=goal, goal_history=history)
    body = open(descriptor["round_report"], encoding="utf-8").read()
    assert "本轮目标与完成度" in body
    assert "72%" in body
    assert "G3 低于阈值 0.09" in body
    assert "提升证据引用密度" in body
    assert "不可得" not in body.split("偏离项")[0] or "0.61" in body


def test_unavailable_metric_is_reported_not_invented(runtime):
    """B6: an unobtainable metric must be labelled, never guessed."""
    run = _completed_run(runtime)
    goal = {"goal_id": "g", "title": "t", "sub_goals": [
        {"id": "G9", "title": "缺失指标", "metric": {"name": "not_available", "op": ">=", "target": 1}},
    ]}
    history = {"weighted_score": 0.0, "per_sub_goal": {"G9": {"actual": None, "met": False}}}
    body = open(analysis_reports.generate(run, goal=goal, goal_history=history)["round_report"],
                encoding="utf-8").read()
    assert "不可得" in body


def test_archive_dir_cannot_escape_root(runtime):
    """cycle_id arrives over HTTP, so it must not be able to escape the archive."""
    for evil in ("../../evil", "..\\..\\evil", "C:/Windows/Temp/evil", "a/../../b"):
        directory = analysis_reports.archive_stage_results(evil, {"base_research": {"x": 1}})
        assert directory is not None
        resolved = __import__("pathlib").Path(directory).resolve()
        archive_root = (runtime / "analysis_runs" / "archive").resolve()
        assert resolved == archive_root or archive_root in resolved.parents, (
            f"{evil!r} escaped to {resolved}"
        )


def test_archive_stage_name_is_sanitized(runtime):
    directory = analysis_reports.archive_stage_results("safe-cycle", {"../../etc/passwd": {"x": 1}})
    files = list(__import__("pathlib").Path(directory).glob("*.json"))
    assert len(files) == 1
    assert "/" not in files[0].name and "\\" not in files[0].name
    assert files[0].name.endswith(".json")


def test_archive_returns_none_for_empty_results(runtime):
    assert analysis_reports.archive_stage_results("c", {}) is None
    assert analysis_reports.archive_stage_results("c", None) is None


def test_report_sections_are_contiguously_numbered(runtime):
    """Found via live E2E: with no goal, numbering jumped 一(missing) -> 二.

    Sections must be numbered by what is present, and the body must carry no
    duplicate metadata line.
    """
    run = _completed_run(runtime)
    body = open(analysis_reports.generate(run)["round_report"], encoding="utf-8").read()
    headings = [line for line in body.split("\n") if line.startswith("## ")]
    numbered = [h for h in headings if not h.startswith("## 附：")]
    numerals = [h[3:].split("、", 1)[0] for h in numbered]
    assert numerals == ["一", "二", "三", "四", "五"][: len(numerals)], numerals
    # No gap: the last numbered section must be the trading disclaimer.
    assert "本报告未执行交易" in numbered[-1]
    assert body.count("生成时间：") == 1, "header must not duplicate the timestamp"


def test_report_numbering_is_contiguous_with_goal(runtime):
    """With a goal attached the goal section takes 一 and the rest shift down."""
    run = _completed_run(runtime)
    goal = {"goal_id": "g", "title": "t", "status": "active", "sub_goals": []}
    body = open(
        analysis_reports.generate(run, goal=goal, goal_history={"weighted_score": 0.5})["round_report"],
        encoding="utf-8",
    ).read()
    numerals = [h[3:].split("、", 1)[0] for h in body.split("\n") if h.startswith("## ") and not h.startswith("## 附：")]
    assert numerals[0] == "一", numerals
    assert len(numerals) == len(set(numerals)), f"duplicate numbering: {numerals}"


def test_ready_for_execution_reports_a_duration(runtime):
    """A round awaiting approval has no completed_at; the window must still be measured."""
    run = _completed_run(runtime)
    assert run["status"] == "ready_for_execution"
    assert run["completed_at"] is None
    body = open(analysis_reports.generate(run)["round_report"], encoding="utf-8").read()
    assert "耗时：-  " not in body


def test_generate_never_raises_on_bad_input(runtime):
    """An auxiliary record must never fail an otherwise good round."""
    descriptor = analysis_reports.generate({"cycle_id": "x" * 500})
    # Either it produced a descriptor or it degraded to an error dict — never raised.
    assert isinstance(descriptor, dict)
    assert "generated_at" in descriptor


def test_index_filters_by_market_and_status(runtime):
    run = _completed_run(runtime, cycle="20260901-cn-manual-a")
    analysis_reports.generate(run)
    assert analysis_reports.read_index(market="cn")
    assert not analysis_reports.read_index(market="us")
    assert analysis_reports.read_index(status="ready_for_execution")
    assert not analysis_reports.read_index(status="failed")

"""The program report must preserve dissent and source metadata without another model."""
import json

from engine import analysis_reports, analysis_runs


def test_brief_report_renders_exact_facts_once_and_every_role(tmp_path, monkeypatch):
    monkeypatch.setattr(analysis_reports, "_analysis_dir", lambda: tmp_path / "analysis_runs")
    fact = {"id": "F-hk-00700-fundamentals#/records/0/metrics/cash_flow/value",
            "source": "investment_fundamentals", "title": "现金流",
            "claim": json.dumps({"value": 16.9, "context": {"unit": "CNY/share", "period_type": "cumulative", "disclosed_at": None}})}
    dissent = "长反证" * 3000 + "尾部的关键异议"
    bundle = {"format": "research-brief-v1", "facts": [fact, fact], "stages": {
        "base_research": [{"label": "00700:fundamentals_analyst", "value": {
            "summary": "不能把每股现金流当总额", "arguments": [{"inference": "仅支持每股指标",
            "evidence_refs": [fact["id"]], "counterargument": dissent, "invalid_if": "取得总额后重评"}],
            "risks": ["没有披露日期"], "data_quality": "未知日期"}}],
        "research_debate": [{"label": "00700:bear-r2", "value": {"thesis": "多空关键分歧", "evidence_ids": [fact["id"]]}}],
        "risk_review": [{"label": "risk-conservative-r3", "value": {"assessment": "换汇风险", "adjustments": ["先核验币种"]}}],
        "final_decision": [{"label": "portfolio-manager", "value": {"summary": "等待核验", "decisions": [{"action": "HOLD", "reason": "证据不足"}]}}],
    }}
    analysis_reports.archive_stage_results("brief-report", {"research_briefs": bundle})
    body = analysis_reports.render_round_report({"cycle_id": "brief-report", "market": "hk"})
    assert body.count("#### " + fact["id"]) == 1
    for field in ["CNY/share", "cumulative", '"disclosed_at": null', "尾部的关键异议", "取得总额后重评", "bear-r2", "多空关键分歧", "risk-conservative-r3", "先核验币种", "portfolio-manager", "证据不足"]:
        assert field in body


def test_legacy_report_and_unknown_format_do_not_render_brief_section(tmp_path, monkeypatch):
    monkeypatch.setattr(analysis_reports, "_analysis_dir", lambda: tmp_path)
    assert "研究论据与完整事实" not in analysis_reports.render_round_report({"cycle_id": "legacy"})
    analysis_reports.archive_stage_results("legacy", {"research_briefs": {"format": "other"}})
    assert "研究论据与完整事实" not in analysis_reports.render_round_report({"cycle_id": "legacy"})


def test_checkpoint_keeps_brief_contract_through_execution_ready(tmp_path, monkeypatch):
    monkeypatch.setattr(analysis_runs, "_directory", lambda: tmp_path)
    analysis_runs.start_or_resume({"cycle_id": "brief-checkpoint", "market": "hk", "symbols": ["00700"]})
    for event in ["checkpoint", "execution_ready"]:
        run = analysis_runs.update({"cycle_id": "brief-checkpoint", "stage": "final_decision", "event": event,
                                   "research_format": "research-brief-v1", "result": {"summary": "裁决"}, "decisions": []})
        assert run["checkpoints"]["final_decision"]["research_format"] == "research-brief-v1"

from __future__ import annotations
from engine.localization import message, current_language, render_in_run_language

from typing import Any, Mapping


@render_in_run_language
def format_cycle_result(result: Mapping[str, Any]) -> str:
    market = str(result.get("market", "")).lower()
    names = {"cn": message('report.mainland.china'), "hk": message('report.hong.kong'), "us": message('report.united.states'), "etf": "ETF"}
    autonomous = result.get("autonomous", {}) if isinstance(result.get("autonomous"), Mapping) else {}
    status = str(result.get("status", ""))
    autonomous_status = str(autonomous.get("status", ""))
    fills = autonomous.get("fills", []) if isinstance(autonomous, Mapping) else []
    warnings = autonomous.get("warnings", []) if isinstance(autonomous, Mapping) else []
    degraded = bool(warnings or autonomous.get("degraded_mode"))
    completed = status == "generated" and autonomous_status in {"executed", "no_trade"}
    lines = [f"## {('✅' if completed and (not degraded) else '⚠️')} {names.get(market, market.upper())}{message('report.complete.investment.round')}"]
    if status:
        lines.append(f"{message('report.report.status')}{status}")
    mandate = result.get("mandate", autonomous.get("mandate", {}))
    if isinstance(mandate, Mapping) and mandate.get("display_name"):
        lines.append(f"{message('report.strategy.mandate')}{mandate.get('display_name')}（{mandate.get('risk_policy_version', '')}）")
    labels = {
        "executed": message('report.analysis.risk.checks.and.paper.execution.completed'),
        "no_trade": message('report.analysis.and.risk.checks.completed.no.executable.orders'),
        "paused": message('report.runtime.safety.pause.no.paper.orders.submitted'),
        "disabled": message('report.autonomous.investing.is.disabled'),
        "blocked": message('report.blocked.by.safety.limits'),
        "error": message('report.investment.workflow.error'),
    }
    lines.append(f"{message('report.execution.status')}{labels.get(autonomous_status, autonomous_status or message('report.unknown'))}")
    reason = autonomous.get("error") or autonomous.get("reason")
    control = autonomous.get("control") if isinstance(autonomous.get("control"), Mapping) else {}
    if not reason and autonomous_status == "paused":
        reason = control.get("reason")
    if reason:
        lines.append(f"{message('report.reason')}{reason}")
    if isinstance(warnings, list):
        for warning in warnings[:5]:
            lines.append(f"{message('report.degradation')}{warning}")
    lines.append(f"{message('report.simulated.fills')}{(len(fills) if isinstance(fills, list) else 0)}")
    if result.get("report"):
        lines.append(f"{message('report.full.report')}{result.get('report')}`")
    notification = result.get("notification", {})
    if isinstance(notification, Mapping):
        lines.append(f"{message('report.report.delivery')}{notification.get('status', message('report.unknown'))}")
        if notification.get("reason"):
            lines.append(f"{message('report.delivery.notes')}{notification.get('reason')}")
    lines.append(message('report.this.round.is.simulated.research.and.paper.trading.not.investment.advice.2'))
    return "\n".join(lines)

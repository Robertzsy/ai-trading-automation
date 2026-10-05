"""Per-round analysis reports (the missing third leg of the report pipeline).

Why this module exists
----------------------
``_write_report`` in ``engine.scheduler`` is reachable from exactly three call
sites, and **none of them runs for a web-launched analysis round**:

* ``scheduler._run_intraday_job`` / ``_run_close_job`` — scheduled rounds only.
* ``trading.decision_execution.submit_decisions`` — the trading path.

Web analysis rounds force ``submit=False`` (``engine/api/server.py``), never
call ``submit_decisions``, and stop at ``ready_for_execution``.  So they
generated no report, stored no report, had no query endpoint and nothing to
display.  This module supplies the missing generator.

Two outputs per round
---------------------
1. **Round report** — ``runtime/reports/{YYYYMMDD}-{market}-{label}-{cycle_id}.md``
   Human-readable, one file per round. The ``{cycle_id}`` suffix is what makes
   per-round reports addressable; the pre-existing
   ``{YYYYMMDD}-{market}-{label}.md`` pattern is untouched so every existing
   glob/reader keeps working.
2. **Full archive** — ``runtime/analysis_runs/archive/{cycle_id}/{stage}.json``
   The workflow truncates stage results to 1600 chars (``compact()`` in
   ``analysis-workflow.js``) before checkpointing, so the durable checkpoint is
   lossy. When a caller supplies an untruncated ``archive`` payload we persist
   it verbatim for forensics, and the round report links to it.

Report generation must never fail a round: it is an auxiliary record, the same
posture ``decision_execution`` takes for its own report/notify step.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

logger = logging.getLogger("investment-auto.analysis-reports")

MAX_LOG_TAIL = 50
MAX_SUMMARY_CHARS = 400


def _reports_dir() -> Path:
    from engine.paths import runtime_dir

    return runtime_dir() / "reports"


def _analysis_dir() -> Path:
    from engine.paths import runtime_dir

    return runtime_dir() / "analysis_runs"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _safe(value: Any, limit: int = 200) -> str:
    """Single-line, table-safe text."""
    text = str(value if value is not None else "").strip()
    text = text.replace("|", "/").replace("\r", " ").replace("\n", " ")
    return text[:limit]


def _fmt_duration(ms: Any) -> str:
    if not isinstance(ms, int) or isinstance(ms, bool) or ms < 0:
        return "-"
    seconds = ms / 1000
    if seconds < 60:
        return f"{seconds:.1f} 秒"
    minutes, remainder = divmod(int(seconds), 60)
    if minutes < 60:
        return f"{minutes} 分 {remainder} 秒"
    hours, minutes = divmod(minutes, 60)
    return f"{hours} 时 {minutes} 分"


def round_report_path(run: Mapping[str, Any]) -> Path:
    """Per-round report path: ``{YYYYMMDD}-{market}-{label}-{cycle_id}.md``."""
    cycle_id = _safe(run.get("cycle_id"), 120)
    market = _safe(run.get("market"), 12).lower() or "cn"
    label = _safe(run.get("label"), 40) or "analysis"
    stamp = _safe(run.get("started_at"), 40)
    try:
        day = datetime.fromisoformat(stamp).strftime("%Y%m%d")
    except (TypeError, ValueError):
        day = datetime.now(timezone.utc).strftime("%Y%m%d")
    safe_label = "".join(char if (char.isalnum() or char in "._-") else "-" for char in label) or "analysis"
    safe_cycle = "".join(char if (char.isalnum() or char in "._-") else "-" for char in cycle_id)
    return _reports_dir() / f"{day}-{market}-{safe_label}-{safe_cycle}.md"


def _slug(value: Any, limit: int = 120) -> str:
    """Filesystem-safe token derived from an untrusted identifier.

    `cycle_id` arrives over HTTP, so it must never be able to escape the
    archive directory. Everything outside ``[A-Za-z0-9._-]`` becomes ``-``,
    which also neutralises path separators, ``..`` traversal and drive letters.
    """
    text = "".join(
        char if (char.isalnum() or char in "._-") else "-" for char in str(value or "")
    ).strip("-")
    return text[:limit] or "unknown"


def archive_stage_results(cycle_id: str, results: Mapping[str, Any]) -> Optional[str]:
    """Persist untruncated stage results; return the archive directory path.

    Returns ``None`` when there is nothing to archive. Never raises.
    """
    if not results:
        return None
    try:
        directory = _analysis_dir() / "archive" / _slug(cycle_id)
        directory.mkdir(parents=True, exist_ok=True)
        for stage, payload in results.items():
            target = directory / f"{_slug(stage, 80)}.json"
            temporary = target.with_suffix(".json.tmp")
            temporary.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2, default=str),
                encoding="utf-8",
            )
            temporary.replace(target)
        return str(directory)
    except Exception:  # noqa: BLE001 - the archive is auxiliary
        logger.exception("[ANALYSIS-REPORT:%s] archive write failed", cycle_id)
        return None


def _goal_section(goal: Optional[Mapping[str, Any]], history_row: Optional[Mapping[str, Any]], number: int) -> List[str]:
    """Render the objective-completion section (empty when no goal is attached)."""
    if not goal and not history_row:
        return []
    lines = [f"## {_cn(number)}、本轮目标与完成度", ""]
    if goal:
        lines.append(f"- **总目标**：{_safe(goal.get('title'), 200) or '(未命名)'}")
        lines.append(f"- **目标状态**：{_safe(goal.get('status'), 40) or 'active'}")
        if goal.get("horizon"):
            horizon = goal.get("horizon") or {}
            if horizon.get("until"):
                lines.append(f"- **期限**：{_safe(horizon.get('until'), 40)}")
    if not history_row:
        lines.append("- 本轮尚未评估（目标评估在轮次终态后异步写入）。")
        lines.append("")
        return lines
    score = history_row.get("weighted_score")
    if isinstance(score, (int, float)) and not isinstance(score, bool):
        lines.append(f"- **加权完成度**：{float(score):.0%}")
    lines.extend(["", "| 子目标 | 优先级 | 指标 | 目标 | 实测 | 是否达成 |", "|---|---|---|---|---|---|"])
    sub_goals = {
        str(item.get("id")): item
        for item in (goal.get("sub_goals") if isinstance(goal, Mapping) else []) or []
        if isinstance(item, Mapping)
    }
    per = history_row.get("per_sub_goal") or {}
    if isinstance(per, Mapping) and per:
        for sub_id, result in per.items():
            definition = sub_goals.get(str(sub_id), {})
            metric = definition.get("metric") or {}
            met = bool((result or {}).get("met")) if isinstance(result, Mapping) else False
            actual = (result or {}).get("actual") if isinstance(result, Mapping) else None
            lines.append(
                f"| {_safe(definition.get('title') or sub_id, 60)} "
                f"| {_safe(definition.get('priority'), 8) or '-'} "
                f"| {_safe(metric.get('name'), 40) or '-'} "
                f"| {_safe(metric.get('op'), 4)}{_safe(metric.get('target'), 20)} "
                f"| {_safe(actual, 20) if actual is not None else '不可得'} "
                f"| {'是' if met else '否'} |"
            )
    else:
        lines.append("| - | - | - | - | - | - |")
    deviation = history_row.get("deviation")
    if isinstance(deviation, list) and deviation:
        lines.extend(["", "**偏离项**："])
        lines.extend(f"- {_safe(item, 200)}" for item in deviation[:10])
    focus = history_row.get("next_focus")
    if isinstance(focus, list) and focus:
        lines.extend(["", "**下一轮优化方向**："])
        lines.extend(f"- {_safe(item, 200)}" for item in focus[:10])
    lines.append("")
    return lines


def _cn(number: int) -> str:
    """1 -> 一, 2 -> 二 … (report section numbering)."""
    digits = "零一二三四五六七八九"
    if number <= 0:
        return "零"
    if number < 10:
        return digits[number]
    if number == 10:
        return "十"
    if number < 20:
        return "十" + digits[number - 10]
    tens, ones = divmod(number, 10)
    return digits[tens] + "十" + (digits[ones] if ones else "")


def _stage_section(run: Mapping[str, Any], number: int) -> List[str]:
    stages = run.get("stages") or {}
    if not isinstance(stages, Mapping) or not stages:
        return []
    order = [
        "preparing", "resuming", "base_research", "research_debate",
        "portfolio_draft", "risk_review", "final_decision", "execution",
    ]
    labels = {
        "preparing": "准备数据", "resuming": "恢复检查点",
        "base_research": "四类基础研究", "research_debate": "多空辩论与研究裁决",
        "portfolio_draft": "组合草案", "risk_review": "风险辩论与裁决",
        "final_decision": "最终组合决策", "execution": "硬风控与模拟执行",
        "ready_for_execution": "等待批准", "completed": "已完成",
        "failed": "失败", "cancelled": "已停止",
    }
    status_labels = {
        "completed": "已完成", "running": "运行中", "failed": "失败",
        "cancelled": "已停止", "pending": "等待中",
    }
    known = [name for name in order if name in stages]
    extra = [name for name in stages if name not in order]
    lines = [f"## {_cn(number)}、阶段时间线", "", "| 阶段 | 状态 | 开始 | 结束 | 耗时 | 子任务 |", "|---|---|---|---|---|---|"]
    for name in [*known, *extra]:
        state = stages.get(name) or {}
        if not isinstance(state, Mapping):
            continue
        total = state.get("agents_total")
        done = state.get("agents_done")
        failed = state.get("agents_failed")
        subtasks = f"{done or 0}/{total or 0}"
        if failed:
            subtasks += f"（失败 {failed}）"
        lines.append(
            f"| {_safe(labels.get(name, name), 40)} "
            f"| {_safe(status_labels.get(str(state.get('status')), state.get('status')), 20)} "
            f"| {_safe(str(state.get('started_at') or '-')[11:19], 12) or '-'} "
            f"| {_safe(str(state.get('finished_at') or '-')[11:19], 12) or '-'} "
            f"| {_fmt_duration(state.get('duration_ms'))} "
            f"| {subtasks} |"
        )
    lines.append("")
    return lines


def _agent_section(run: Mapping[str, Any], number: int = 3) -> List[str]:
    agents = run.get("agents") or {}
    if not isinstance(agents, Mapping) or not agents:
        return []
    lines = [
        f"## {_cn(number)}、子任务明细", "",
        "| 子任务 | 阶段 | 状态 | 耗时 | 结果摘要 |", "|---|---|---|---|---|",
    ]
    rows = sorted(
        (value for value in agents.values() if isinstance(value, Mapping)),
        key=lambda item: (str(item.get("started_at") or ""), str(item.get("label") or "")),
    )
    for agent in rows:
        status = str(agent.get("status"))
        status_text = {"completed": "完成", "running": "运行中", "failed": "失败", "cancelled": "已停止"}.get(
            status, status or "-"
        )
        summary = agent.get("summary") or agent.get("error") or "-"
        lines.append(
            f"| {_safe(agent.get('label') or '-', 80)} "
            f"| {_safe(agent.get('phase') or agent.get('stage') or '-', 40)} "
            f"| {status_text} "
            f"| {_fmt_duration(agent.get('duration_ms'))} "
            f"| {_safe(summary, MAX_SUMMARY_CHARS)} |"
        )
    lines.append("")
    return lines


def _decision_section(run: Mapping[str, Any], number: int = 4) -> List[str]:
    decisions = run.get("decisions")
    if not isinstance(decisions, list) or not decisions:
        return []
    action_labels = {"BUY": "买入/加仓", "SELL": "卖出/减仓", "HOLD": "观望/继续持有"}
    lines = [
        f"## {_cn(number)}、研究结论（逐标的）", "",
        "| 标的 | 建议 | 目标权重 | 置信度 | 依据 | 引用证据 |",
        "|---|---|---|---|---|---|",
    ]
    for item in decisions:
        if not isinstance(item, Mapping):
            continue
        weight = item.get("target_weight")
        confidence = item.get("confidence")
        weight_text = f"{float(weight):.0%}" if isinstance(weight, (int, float)) and not isinstance(weight, bool) else "-"
        confidence_text = (
            f"{float(confidence):.0%}" if isinstance(confidence, (int, float)) and not isinstance(confidence, bool) else "-"
        )
        evidence = item.get("evidence_ids")
        evidence_text = f"{len(evidence)} 条" if isinstance(evidence, list) else "-"
        lines.append(
            f"| {_safe(item.get('symbol'), 20)} "
            f"| {_safe(action_labels.get(str(item.get('action', '')).upper(), item.get('action')), 20)} "
            f"| {weight_text} | {confidence_text} "
            f"| {_safe(item.get('reason'), 240)} | {evidence_text} |"
        )
    lines.append("")
    return lines


def _risk_section(run: Mapping[str, Any], number: int = 5) -> List[str]:
    warnings = run.get("warnings")
    failed_agents = [
        value for value in (run.get("agents") or {}).values()
        if isinstance(value, Mapping) and value.get("status") == "failed"
    ]
    if not (isinstance(warnings, list) and warnings) and not failed_agents and not run.get("error"):
        return []
    lines = [f"## {_cn(number)}、风险与降级", ""]
    if run.get("error"):
        lines.append(f"- **轮次错误**：{_safe(run.get('error'), 500)}")
    if isinstance(warnings, list):
        for warning in warnings[:20]:
            lines.append(f"- **降级说明**：{_safe(warning, 400)}")
    if failed_agents:
        lines.append(f"- **失败子任务 {len(failed_agents)} 个**：")
        for agent in failed_agents[:20]:
            lines.append(
                f"  - {_safe(agent.get('label') or '-', 80)}"
                f"（{_safe(agent.get('phase') or agent.get('stage') or '-', 40)}）："
                f"{_safe(agent.get('error') or '未提供原因', 300)}"
            )
    lines.append("")
    return lines


def _log_section(run: Mapping[str, Any]) -> List[str]:
    logs = run.get("logs")
    if not isinstance(logs, list) or not logs:
        return []
    lines = [f"## 附：日志尾部（最近 {min(len(logs), MAX_LOG_TAIL)} 条）", "", "```text"]
    for entry in logs[-MAX_LOG_TAIL:]:
        if not isinstance(entry, Mapping):
            continue
        lines.append(
            f"{_safe(entry.get('at'), 30)} {_safe(entry.get('level'), 8).upper():<5} "
            f"[{_safe(entry.get('stage'), 40)}] {_safe(entry.get('message'), 300)}"
        )
    lines.extend(["```", ""])
    return lines


def render_round_report(
    run: Mapping[str, Any],
    *,
    goal: Optional[Mapping[str, Any]] = None,
    goal_history: Optional[Mapping[str, Any]] = None,
    archive_dir: Optional[str] = None,
) -> str:
    """Render the human-readable per-round report body (no header prefix)."""
    market = _safe(run.get("market"), 12).upper()
    label = _safe(run.get("label"), 40) or "analysis"
    status = str(run.get("status") or "unknown")
    status_labels = {
        "ready_for_execution": "分析完成，等待批准",
        "completed": "已完成", "failed": "失败", "cancelled": "已停止",
        "running": "运行中",
    }
    stages = run.get("stages") or {}
    done_stages = sum(
        1 for state in stages.values()
        if isinstance(state, Mapping) and state.get("status") == "completed"
    )
    agents = run.get("agents") or {}
    finished = [value for value in agents.values() if isinstance(value, Mapping) and value.get("status") == "completed"]
    failed = [value for value in agents.values() if isinstance(value, Mapping) and value.get("status") == "failed"]
    duration = None
    started = run.get("started_at")
    ended = run.get("completed_at")
    if not isinstance(ended, str):
        # A round sitting in ready_for_execution has no completed_at yet; the
        # last update is the honest end of the measured window.
        ended = run.get("updated_at") if run.get("status") in {"ready_for_execution", "cancelled"} else None
    if isinstance(started, str) and isinstance(ended, str):
        from engine.analysis_events import ms_between

        duration = ms_between(started, ended)

    header_lines: List[str] = [
        f"# {market} {label} 分析轮次报告 · {_safe(run.get('cycle_id'), 120)}",
        "",
        f"> 轮次状态：{status_labels.get(status, status)}  ",
        f"> 阶段：{done_stages}/{len(stages)} 完成  ",
        f"> 耗时：{_fmt_duration(duration)}  ",
        f"> 子任务：{len(finished)} 完成 / {len(failed)} 失败 / 共 {len(agents)}  ",
        f"> 证据：{run.get('evidence_count', 0)} 条  ",
        f"> 标的：{_safe(', '.join(str(item) for item in (run.get('symbols') or [])) or '(由流程内部选股)', 400)}  ",
        f"> 标的来源：{_safe(run.get('symbols_source'), 40) or '-'}",
        "",
    ]
    # Sections are numbered by what is actually present, so the report never
    # shows a gap (e.g. jumping 二 -> 三 when no goal is attached).
    body: List[str] = []
    number = 1
    for block in (
        _goal_section(goal, goal_history, 1),
        _stage_section(run, 2),
        _agent_section(run, 3),
        _decision_section(run, 4),
        _risk_section(run, 5),
    ):
        if not block:
            continue
        # Re-number to the next contiguous slot (each builder emits a
        # "## <n>、标题" heading; only the numeral is rewritten here).
        block = [re.sub(r"^##\s+\S+?、", f"## {_cn(number)}、", block[0]), *block[1:]]
        body.extend(block)
        number += 1
    body.extend([
        f"## {_cn(number)}、本报告未执行交易", "",
        "本轮为分析轮次（`submit=false`）。分析不会改变任何账户；如需执行，请在界面显式批准后",
        f"用同一 cycle_id（`{_safe(run.get('cycle_id'), 120)}`）提交，引擎将校验决策指纹与硬风控边界。",
        "",
    ])
    lines = header_lines + body
    if archive_dir:
        lines.extend([
            "## 附：未截断阶段产物", "",
            f"完整阶段结果（未经过工作流 1600 字符截断）保存在 `<runtime>/{_safe(archive_dir, 300)}`。",
            "",
        ])
    lines.extend(_log_section(run))
    lines.append("本轮为模拟研究与纸面交易，不构成投资建议。")
    return "\n".join(lines)


def _index_path() -> Path:
    return _reports_dir() / "index.json"


def _read_index() -> List[Dict[str, Any]]:
    path = _index_path()
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return payload if isinstance(payload, list) else []


def read_index(*, market: str = "", limit: int = 50, status: str = "") -> List[Dict[str, Any]]:
    """Round-report index, newest first."""
    normalized_market = str(market or "").strip().lower()
    normalized_status = str(status or "").strip().lower()
    rows = [
        row for row in _read_index()
        if isinstance(row, Mapping)
        and (not normalized_market or str(row.get("market")) == normalized_market)
        and (not normalized_status or str(row.get("status")) == normalized_status)
    ]
    rows.sort(key=lambda row: str(row.get("generated_at") or ""), reverse=True)
    return [dict(row) for row in rows[: max(1, min(200, int(limit)))]]


def _update_index(entry: Mapping[str, Any]) -> None:
    directory = _reports_dir()
    directory.mkdir(parents=True, exist_ok=True)
    rows = [
        row for row in _read_index()
        if not (isinstance(row, Mapping) and row.get("cycle_id") == entry.get("cycle_id"))
    ]
    rows.append(dict(entry))
    rows.sort(key=lambda row: str(row.get("generated_at") or ""), reverse=True)
    target = _index_path()
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(rows[:500], ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    temporary.replace(target)


def generate(
    run: Mapping[str, Any],
    *,
    goal: Optional[Mapping[str, Any]] = None,
    goal_history: Optional[Mapping[str, Any]] = None,
    stage_results: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """Write the per-round report + archive + index entry.

    Returns a descriptor dict (also stored on the run as ``report_meta``).
    Never raises: a failed report must not fail an otherwise good round.
    """
    cycle_id = _safe(run.get("cycle_id"), 120)
    try:
        archive_dir = archive_stage_results(cycle_id, stage_results or {}) if stage_results else None
        body = render_round_report(
            run, goal=goal, goal_history=goal_history, archive_dir=archive_dir,
        )
        target = round_report_path(run)
        title = (
            f"# {_safe(run.get('market'), 12).upper()} {_safe(run.get('label'), 40)} 分析轮次报告\n\n"
            f"> 生成时间：{_now()}  | 模式：手动/固定分析流程\n\n"
        )
        # Strip the renderer's own H1 so the prefix owns the title.
        body_without_h1 = body.split("\n", 1)[1].lstrip("\n") if body.startswith("# ") else body
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(title + body_without_h1 + "\n", encoding="utf-8")
        size = target.stat().st_size
        # Analysis-cycle archive (structured) alongside the report.
        cycle_archive = _analysis_dir() / "reports"
        try:
            cycle_archive.mkdir(parents=True, exist_ok=True)
            cycle_target = cycle_archive / f"{target.stem}-cycle.md"
            cycle_target.write_text(body, encoding="utf-8")
        except OSError:
            cycle_target = None
        descriptor = {
            "round_report": str(target),
            "cycle_report": str(cycle_target) if cycle_target else None,
            "archive_dir": archive_dir,
            "generated_at": _now(),
            "bytes": size,
        }
        _update_index({
            "cycle_id": cycle_id,
            "market": run.get("market"),
            "label": run.get("label"),
            "status": run.get("status"),
            "symbols": list(run.get("symbols") or []),
            "symbols_source": run.get("symbols_source"),
            "started_at": run.get("started_at"),
            "finished_at": run.get("completed_at"),
            "evidence_count": run.get("evidence_count", 0),
            "decisions_count": len(run.get("decisions") or []) if isinstance(run.get("decisions"), list) else 0,
            "agents_total": len(run.get("agents") or {}),
            "goal_id": run.get("goal_id"),
            "goal_score": (goal_history or {}).get("weighted_score") if goal_history else None,
            "report_file": target.name,
            "report_bytes": size,
            "generated_at": descriptor["generated_at"],
        })
        return descriptor
    except Exception as exc:  # noqa: BLE001 - auxiliary record, never fatal
        logger.exception("[ANALYSIS-REPORT:%s] generation failed", cycle_id)
        return {"error": str(exc)[:500], "generated_at": _now()}


def _within(directory: Path, candidate: Path) -> bool:
    try:
        resolved = candidate.resolve()
        root = directory.resolve()
    except OSError:
        return False
    return resolved == root or root in resolved.parents


def read_report_content(*, cycle_id: str = "", file: str = "") -> Dict[str, Any]:
    """Read one report body by cycle id or by file name.

    Path traversal is rejected twice: the file name must match a strict
    allow-list pattern, and the resolved path must stay inside the reports
    directory (or the analysis archive).
    """
    directory = _reports_dir()
    if cycle_id:
        rows = read_index(limit=200)
        match = next((row for row in rows if str(row.get("cycle_id")) == str(cycle_id)), None)
        if match is None:
            raise KeyError(f"report not found for cycle_id: {cycle_id}")
        file = str(match.get("report_file") or "")
        if not file:
            raise KeyError(f"report not found for cycle_id: {cycle_id}")
    name = str(file or "").strip()
    if not name:
        raise ValueError("必须提供 cycle_id 或 file")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+\.md", name):
        raise ValueError("非法的报告文件名")
    candidate = directory / name
    if not _within(directory, candidate):
        raise ValueError("非法的报告路径")
    if not candidate.is_file():
        raise KeyError(f"报告文件不存在: {name}")
    text = candidate.read_text(encoding="utf-8")
    return {
        "file": name,
        "path": str(candidate),
        "bytes": len(text.encode("utf-8")),
        "content": text,
    }

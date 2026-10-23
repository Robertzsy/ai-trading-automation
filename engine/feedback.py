"""Round feedback loop: persist what each analysis round produced so a weekly
review can compare data quality, screening freshness and decision reasons.

The goal is self-optimisation with a human in the loop: this module only WRITES
observations and SUMMARISES them. It never changes thresholds, prompts or code.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from engine import paths

_REASON_BUCKETS = {
    "confidence": re.compile(r"置信度|confidence|min_confidence", re.I),
    "data_gap": re.compile(r"amount=0|流动性|数据缺口|缺失|degraded|无第二行情源", re.I),
    "price_zone": re.compile(r"赔率|价位|买区|追多|阻力|支撑", re.I),
    "trend": re.compile(r"空头排列|均线|趋势未修复|MA\d{2,3}", re.I),
    "fundamental": re.compile(r"毛利|净利|营收|现金流|估值", re.I),
    "risk_limit": re.compile(r"max_|硬边界|风控|仓位上限|最小现金", re.I),
}


def feedback_dir() -> Path:
    """Resolved lazily so tests and alternate data roots can redirect it."""
    return paths.runtime_dir() / "opt-feedback"


def _classify(reason: str) -> List[str]:
    text = str(reason or "")
    hits = [name for name, pattern in _REASON_BUCKETS.items() if pattern.search(text)]
    return hits or ["other"]


def _screening_block(run: Dict[str, Any]) -> Dict[str, Any]:
    screening = run.get("screening") if isinstance(run.get("screening"), dict) else {}
    block: Dict[str, Any] = {
        "generated_at": screening.get("generated_at"),
        "source": screening.get("source"),
        "selected_count": screening.get("selected_count"),
        "age_minutes_at_start": None,
    }
    generated = str(screening.get("generated_at") or "")
    started = str(run.get("started_at") or "")
    try:
        block["age_minutes_at_start"] = round(
            (datetime.fromisoformat(started) - datetime.fromisoformat(generated)).total_seconds() / 60, 1
        )
    except (TypeError, ValueError):
        pass
    return block


def _execution_summary(run: Dict[str, Any]) -> Dict[str, Any]:
    execution = run.get("execution") if isinstance(run.get("execution"), dict) else {}
    fills = execution.get("fills") if isinstance(execution.get("fills"), list) else []
    rejected = execution.get("rejected") if isinstance(execution.get("rejected"), list) else []
    return {"fills": len(fills), "rejected": len(rejected)}


def _parse_stamp(value: Any) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(str(value or ""))
    except (TypeError, ValueError):
        return None


def data_quality_summary(start: Optional[datetime] = None, end: Optional[datetime] = None) -> Dict[str, Any]:
    """Snapshot gap rate observed in the data-quality log within a window."""
    path = feedback_dir() / "data-quality.jsonl"
    rows: List[Dict[str, Any]] = []
    if path.is_file():
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            lines = []
        for line in lines:
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            when = _parse_stamp(row.get("at"))
            if when is None:
                continue
            if start is not None and when < start:
                continue
            if end is not None and when > end:
                continue
            rows.append(row)
    sources: Dict[str, int] = {}
    for row in rows:
        for source in row.get("sources") or []:
            sources[source] = sources.get(source, 0) + 1
    remaining = [row for row in rows if row.get("remaining_gaps")]
    return {
        "snapshots": len(rows),
        "with_initial_gaps": len([row for row in rows if row.get("initial_gaps")]),
        "with_remaining_gaps": len(remaining),
        "filled": len([row for row in rows if row.get("filled")]),
        "gap_rate": round(len(remaining) / len(rows), 3) if rows else None,
        "sources": dict(sorted(sources.items(), key=lambda item: -item[1])),
    }


def write_round_feedback(run: Dict[str, Any]) -> None:
    """Write one JSON observation per terminal round (idempotent by cycle id)."""
    cycle_id = str(run.get("cycle_id") or "").strip()
    if not cycle_id:
        return
    decisions = [row for row in (run.get("decisions") or []) if isinstance(row, dict)]
    hold_reasons = [
        bucket
        for row in decisions
        if str(row.get("action") or "").upper() != "BUY"
        for bucket in _classify(row.get("reason"))
    ]
    payload = {
        "cycle_id": cycle_id,
        "market": run.get("market"),
        "label": run.get("label"),
        "status": run.get("status"),
        "symbols": run.get("symbols") or [],
        "symbols_source": run.get("symbols_source"),
        "started_at": run.get("started_at"),
        "completed_at": run.get("completed_at") or run.get("updated_at"),
        "duration_seconds": None,
        "evidence_count": run.get("evidence_count"),
        "agents": {
            "expected": run.get("expected_agents"),
            "started": run.get("started_agents"),
            "completed": run.get("completed_agents"),
            "failed": run.get("failed_agents"),
        },
        "screening": _screening_block(run),
        "decisions": [
            {
                "symbol": row.get("symbol"),
                "action": row.get("action"),
                "confidence": row.get("confidence"),
                "target_weight": row.get("target_weight"),
                "reason_buckets": _classify(row.get("reason")),
            }
            for row in decisions
        ],
        "hold_reason_buckets": sorted(set(hold_reasons)),
        "hold_reason_counts": dict(Counter(hold_reasons)),
        "execution": _execution_summary(run),
        "usage": (run.get("model_usage") or {}).get("totals") or {},
        "warnings": run.get("warnings") or [],
        "recorded_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    started = str(run.get("started_at") or "")
    finished = str(run.get("completed_at") or run.get("updated_at") or "")
    try:
        payload["duration_seconds"] = round(
            (datetime.fromisoformat(finished) - datetime.fromisoformat(started)).total_seconds(), 1
        )
    except (TypeError, ValueError):
        pass
    payload["data_quality"] = data_quality_summary(_parse_stamp(started), _parse_stamp(finished))
    try:
        directory = feedback_dir()
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / f"round-{cycle_id}.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        return


def _load(days: int) -> List[Dict[str, Any]]:
    cutoff = datetime.now().astimezone() - timedelta(days=days)
    rows: List[Dict[str, Any]] = []
    directory = feedback_dir()
    if not directory.is_dir():
        return rows
    for path in sorted(directory.glob("round-*.json")):
        try:
            row = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        stamp = str(row.get("completed_at") or row.get("started_at") or "")
        try:
            when = datetime.fromisoformat(stamp)
        except ValueError:
            continue
        if when >= cutoff:
            rows.append(row)
    return rows


def _current_threshold(default: float = 0.65) -> float:
    try:
        from engine.investment.mandate import get_mandate

        return float(get_mandate().get("min_confidence", default))
    except Exception:  # noqa: BLE001 - reporting must not depend on mandate I/O
        return default


def metrics(days: int = 7, *, min_confidence: Optional[float] = None) -> Dict[str, Any]:
    """Aggregate the tracked signals the feedback loop is judged on."""
    if min_confidence is None:
        min_confidence = _current_threshold()
    rows = _load(days)
    buckets: Dict[str, int] = {}
    confidence: List[float] = []
    decisions = 0
    buys = 0
    fills = 0
    rejected = 0
    screening_ages: List[float] = []
    for row in rows:
        counted = False
        for decision in row.get("decisions") or []:
            decisions += 1
            value = decision.get("confidence")
            if isinstance(value, (int, float)):
                confidence.append(float(value))
            if str(decision.get("action") or "").upper() == "BUY":
                buys += 1
                continue
            # Per-decision buckets are the truthful distribution; legacy records
            # stored a single "reason_bucket" string instead of a list.
            decision_buckets = decision.get("reason_buckets")
            if not isinstance(decision_buckets, list):
                single = decision.get("reason_bucket")
                decision_buckets = [single] if single else []
            for bucket in decision_buckets:
                buckets[bucket] = buckets.get(bucket, 0) + 1
                counted = True
        if not counted:
            # Rounds without per-decision data still expose the bucket set.
            for bucket in row.get("hold_reason_buckets") or []:
                buckets[bucket] = buckets.get(bucket, 0) + 1
        execution = row.get("execution") or {}
        fills += int(execution.get("fills") or 0)
        rejected += int(execution.get("rejected") or 0)
        age = ((row.get("screening") or {}).get("age_minutes_at_start"))
        if isinstance(age, (int, float)):
            screening_ages.append(float(age))
    below = [value for value in confidence if value < min_confidence]
    cutoff = datetime.now().astimezone() - timedelta(days=days)
    return {
        "days": days,
        "rounds": len(rows),
        "decisions": decisions,
        "buys": buys,
        "fills": fills,
        "rejected": rejected,
        "execution_rate": round(fills / decisions, 3) if decisions else None,
        "confidence": {
            "count": len(confidence),
            "avg": round(sum(confidence) / len(confidence), 3) if confidence else None,
            "min": round(min(confidence), 3) if confidence else None,
            "max": round(max(confidence), 3) if confidence else None,
            "below_threshold": len(below),
            "below_threshold_share": round(len(below) / len(confidence), 3) if confidence else None,
            "threshold": min_confidence,
        },
        "hold_reason_buckets": dict(sorted(buckets.items(), key=lambda item: -item[1])),
        "screening_age_minutes": {
            "count": len(screening_ages),
            "avg": round(sum(screening_ages) / len(screening_ages), 1) if screening_ages else None,
            "max": round(max(screening_ages), 1) if screening_ages else None,
            "stale_rounds": len([age for age in screening_ages if age > 30]),
        },
        "data_quality": data_quality_summary(cutoff, None),
    }


def recommendations(data: Dict[str, Any], limit: int = 3) -> List[str]:
    """Turn the aggregated metrics into at most ``limit`` actionable suggestions.

    These are proposals only: applying any of them requires explicit user
    confirmation (see notes/SELF_OPTIMIZATION_POLICY.zh.md).
    """
    out: List[str] = []
    quality = data.get("data_quality") or {}
    gap_rate = quality.get("gap_rate")
    if isinstance(gap_rate, (int, float)) and gap_rate > 0:
        out.append(
            "数据源：仍有 "
            + str(round(gap_rate * 100, 1))
            + "% 的快照缺少 amount/pe（"
            + str(quality.get("with_remaining_gaps"))
            + "/"
            + str(quality.get("snapshots"))
            + "），先补齐这些标的的数据，再判断置信度是否需要调整。"
        )
    confidence = data.get("confidence") or {}
    share = confidence.get("below_threshold_share")
    if isinstance(share, (int, float)) and share >= 0.5:
        out.append(
            "置信度："
            + str(confidence.get("below_threshold"))
            + "/"
            + str(confidence.get("count"))
            + " 个决策低于 "
            + str(confidence.get("threshold"))
            + "；若数据缺口已清零仍如此，再评估角色校准或策略档位，不要先放宽风控。"
        )
    screening = data.get("screening_age_minutes") or {}
    if (screening.get("stale_rounds") or 0) > 0:
        out.append(
            "选股新鲜度：有 "
            + str(screening.get("stale_rounds"))
            + " 轮使用的选股结果超过 30 分钟，确认这些轮次是否绕过了自动重新选股。"
        )
    buckets = data.get("hold_reason_buckets") or {}
    if len(out) < limit and buckets:
        top = next(iter(buckets))
        if top in {"price_zone", "trend"}:
            out.append("选股时点：HOLD 原因以 " + top + " 为主，优先调整候选池/入场时点，而不是放宽风控。")
    return out[:limit]


def weekly_summary(days: int = 7) -> str:
    """Render a markdown review of the last ``days`` rounds (no model calls)."""
    rows = _load(days)
    if not rows:
        return "# 自优化周报\n\n最近 " + str(days) + " 天没有已完成的轮次记录。\n"
    data = metrics(days)
    confidence = data["confidence"]
    lines = [
        "# 自优化周报（近 " + str(days) + " 天）",
        "",
        "- 轮次：" + str(data["rounds"]),
        "- 决策数：" + str(data["decisions"]) + "，其中 BUY " + str(data["buys"])
        + "，成交 " + str(data["fills"]) + "，拒绝 " + str(data["rejected"])
        + "，执行率 " + ("-" if data["execution_rate"] is None else str(data["execution_rate"])),
        "- 平均置信度：" + ("-" if confidence["avg"] is None else str(confidence["avg"]))
        + "（" + str(confidence["below_threshold"]) + "/" + str(confidence["count"])
        + " 低于 " + str(confidence["threshold"]) + "）",
        "- HOLD 原因分布：" + ("、".join(f"{k} {v}" for k, v in data["hold_reason_buckets"].items()) or "-"),
        "- 选股新鲜度（开始时）：平均 "
        + ("-" if data["screening_age_minutes"]["avg"] is None else str(data["screening_age_minutes"]["avg"]) + " 分钟")
        + "，过期轮次 " + str(data["screening_age_minutes"]["stale_rounds"]),
        "- 数据缺口率：" + (
            "-" if data["data_quality"]["gap_rate"] is None
            else str(data["data_quality"]["gap_rate"]) + "（快照 " + str(data["data_quality"]["snapshots"])
            + "，仍有缺口 " + str(data["data_quality"]["with_remaining_gaps"]) + "）"
        ),
        "",
        "## 逐轮",
    ]
    for row in rows:
        lines.append(
            "- " + str(row.get("cycle_id")) + " · " + str(row.get("market")) + " · "
            + str(row.get("status")) + " · 证据 " + str(row.get("evidence_count"))
            + " · " + ",".join(sorted(set(row.get("hold_reason_buckets") or [])))
        )
    advice = recommendations(data)
    lines += ["", "## 建议（需人工确认后才实施）"]
    if advice:
        lines += [str(index + 1) + ". " + item for index, item in enumerate(advice)]
    else:
        lines.append("暂无需要调整的项；继续积累轮次数据。")
    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys

    args = sys.argv[1:]
    days = 7
    for item in args:
        if item.isdigit():
            days = int(item)
    if "--json" in args:
        print(json.dumps(metrics(days), ensure_ascii=False, indent=2))
    else:
        print(weekly_summary(days))

"""Persistent research plan cache.

A plan is the per-symbol 5+10+5 search checklist shared by the four base
research roles. It changes slowly (same market/symbol/day), so caching it
across rounds removes repeated plan construction while keeping the roles free
to add evidence-specific queries.

Storage: {data_root}/runtime/research-plans/{market}/{symbol}-{day}.json
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from engine.paths import data_root

MARKETS = {"cn", "hk", "us", "etf"}
SYMBOL_RE = re.compile(r"^[A-Za-z0-9.\-]{1,24}$")
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_PLAN_CHARS = 20_000


def plans_root() -> Path:
    return data_root() / "runtime" / "research-plans"


def _validate(market: str, symbol: str, day: str) -> tuple[str, str, str]:
    market = str(market or "").strip().lower()
    symbol = str(symbol or "").strip().upper()
    day = str(day or "").strip()
    if market not in MARKETS:
        raise ValueError("market must be cn, hk, us or etf")
    if not SYMBOL_RE.match(symbol):
        raise ValueError("invalid symbol")
    if not DAY_RE.match(day):
        raise ValueError("day must be YYYY-MM-DD")
    try:
        date.fromisoformat(day)
    except ValueError as exc:
        raise ValueError("invalid day") from exc
    return market, symbol, day


def plan_path(market: str, symbol: str, day: str, root: Optional[Path] = None, language: str = "zh", template: str = "legacy") -> Path:
    market, symbol, day = _validate(market, symbol, day)
    if language not in {"zh", "en"} or not re.fullmatch(r"[A-Za-z0-9_.-]{1,60}", template):
        raise ValueError("invalid research plan language/template")
    suffix = "" if language == "zh" and template == "legacy" else f"-{language}-{template}"
    return (root or plans_root()) / market / f"{symbol}-{day}{suffix}.json"


def load_plan(market: str, symbol: str, day: str, root: Optional[Path] = None, max_age_days: int = 7, *, language: str = "zh", template: str = "legacy") -> Dict[str, Any]:
    path = plan_path(market, symbol, day, root, language, template)
    if not path.exists():
        return {"found": False}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"found": False, "error": "corrupt plan"}
    saved_at = str(payload.get("saved_at") or "")
    try:
        if saved_at and datetime.fromisoformat(saved_at) < datetime.now() - timedelta(days=max_age_days):
            return {"found": False, "expired": True}
    except ValueError:
        pass
    plan = payload.get("plan")
    if not isinstance(plan, str) or not plan.strip():
        return {"found": False, "error": "empty plan"}
    return {"found": True, "plan": plan, "saved_at": saved_at, "market": market, "symbol": symbol, "day": day}


def save_plan(market: str, symbol: str, day: str, plan: str, root: Optional[Path] = None, *, language: str = "zh", template: str = "legacy") -> Dict[str, Any]:
    if not isinstance(plan, str) or not plan.strip():
        raise ValueError("plan must be a non-empty string")
    if len(plan) > MAX_PLAN_CHARS:
        raise ValueError("plan is too large")
    path = plan_path(market, symbol, day, root, language, template)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "market": market,
        "symbol": symbol,
        "day": day,
        "plan": plan,
        "saved_at": datetime.now().isoformat(timespec="seconds"),
        "version": 1, "output_language": language, "template_version": template,
    }
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)
    return {"saved": True, "path": str(path), "saved_at": payload["saved_at"]}

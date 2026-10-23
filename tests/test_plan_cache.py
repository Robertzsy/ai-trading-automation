from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from engine.research import plan_cache


def test_save_and_load_plan(tmp_path: Path) -> None:
    saved = plan_cache.save_plan("hk", "00700", "2026-10-18", "plan-v1", root=tmp_path)
    assert saved["saved"] is True
    loaded = plan_cache.load_plan("hk", "00700", "2026-10-18", root=tmp_path)
    assert loaded["found"] is True
    assert loaded["plan"] == "plan-v1"


def test_missing_plan_returns_not_found(tmp_path: Path) -> None:
    assert plan_cache.load_plan("cn", "600519", "2026-10-18", root=tmp_path)["found"] is False


def test_expired_plan_is_not_returned(tmp_path: Path) -> None:
    path = plan_cache.plan_path("us", "AAPL", "2026-10-18", root=tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"plan": "old", "saved_at": (datetime.now() - timedelta(days=30)).isoformat()}), encoding="utf-8")
    loaded = plan_cache.load_plan("us", "AAPL", "2026-10-18", root=tmp_path, max_age_days=7)
    assert loaded["found"] is False
    assert loaded.get("expired") is True


@pytest.mark.parametrize("market,symbol,day", [
    ("jp", "00700", "2026-10-18"),
    ("hk", "../etc", "2026-10-18"),
    ("hk", "00700", "18-10-2026"),
])
def test_invalid_keys_are_rejected(market: str, symbol: str, day: str) -> None:
    with pytest.raises(ValueError):
        plan_cache.plan_path(market, symbol, day)


def test_plan_size_is_bounded(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        plan_cache.save_plan("hk", "00700", "2026-10-18", "x" * (plan_cache.MAX_PLAN_CHARS + 1), root=tmp_path)

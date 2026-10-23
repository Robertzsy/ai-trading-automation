from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from engine.research import search_cache


def test_normalize_query_collapses_noise() -> None:
    assert search_cache.normalize_query("  Xiaomi   Q3   results，") == "xiaomi q3 results"


def test_exact_query_roundtrip(tmp_path: Path) -> None:
    result = {"sources": [{"url": "https://example.com/a", "title": "A"}]}
    search_cache.save("hk", "00700", "Tencent Q3 results", "2026-10-18", result, root=tmp_path)
    loaded = search_cache.load("hk", "00700", "  Tencent   Q3 results ", "2026-10-18", root=tmp_path)
    assert loaded["hit"] is True
    assert loaded["result"]["sources"][0]["url"] == "https://example.com/a"


def test_different_query_is_a_miss(tmp_path: Path) -> None:
    search_cache.save("hk", "00700", "Tencent Q3", "2026-10-18", {"sources": []}, root=tmp_path)
    assert search_cache.load("hk", "00700", "Tencent Q2", "2026-10-18", root=tmp_path)["hit"] is False


def test_expired_entry_is_a_miss(tmp_path: Path) -> None:
    path = search_cache.cache_path("cn", "600519", "业绩", "2026-10-18", root=tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"result": {"sources": []}, "created_at": (datetime.now() - timedelta(hours=30)).isoformat()}), encoding="utf-8")
    assert search_cache.load("cn", "600519", "业绩", "2026-10-18", root=tmp_path, ttl_hours=24)["hit"] is False


def test_oversized_result_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        search_cache.save("hk", "00700", "q", "2026-10-18", {"blob": "x" * (search_cache.MAX_RESULT_BYTES + 1)}, root=tmp_path)

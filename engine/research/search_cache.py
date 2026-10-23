"""Exact-query cache for web-search results (semantic-cache v1, unwired).

Only identical normalized queries are reused; fuzzy/embedding matching is a
later layer. Scope is intentionally narrow:

  * key = market | symbol | normalized_query | day
  * TTL 24h, stored as JSON under runtime/search-cache/
  * never caches structured outputs, evidence registries or decisions

Wiring: the native web_search tool currently bypasses the engine. The next
step is a small tool proxy in dsh-investment-tools that calls
``/api/research/search-cache`` for an exact hit and otherwise forwards to the
native search, then stores the result. Until that proxy exists this module is
tested but not on the production path.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from engine.paths import data_root

MAX_RESULT_BYTES = 500_000


def cache_root() -> Path:
    return data_root() / "runtime" / "search-cache"


def normalize_query(query: str) -> str:
    text = str(query or "").strip().lower()
    text = text.replace("（", "(").replace("）", ")").replace("【", "[").replace("】", "]")
    text = re.sub(r"[，。；：、！？,.;:!?\"'“”‘’()\[\]{}<>《》]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def cache_key(market: str, symbol: str, query: str, day: str) -> str:
    material = "|".join([str(market).lower(), str(symbol).upper(), normalize_query(query), str(day)])
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]


def cache_path(market: str, symbol: str, query: str, day: str, root: Optional[Path] = None) -> Path:
    market = str(market or "").strip().lower()
    symbol = str(symbol or "").strip().upper()
    if market not in {"cn", "hk", "us", "etf"}:
        raise ValueError("market must be cn, hk, us or etf")
    if not symbol or not str(day):
        raise ValueError("symbol and day are required")
    return (root or cache_root()) / market / f"{cache_key(market, symbol, query, day)}.json"


def load(market: str, symbol: str, query: str, day: str, root: Optional[Path] = None, ttl_hours: int = 24) -> Dict[str, Any]:
    path = cache_path(market, symbol, query, day, root)
    if not path.exists():
        return {"hit": False}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"hit": False, "error": "corrupt cache"}
    created_at = str(payload.get("created_at") or "")
    try:
        if created_at and datetime.fromisoformat(created_at) < datetime.now() - timedelta(hours=ttl_hours):
            return {"hit": False, "expired": True}
    except ValueError:
        pass
    result = payload.get("result")
    if not isinstance(result, dict):
        return {"hit": False, "error": "empty cache"}
    return {"hit": True, "result": result, "created_at": created_at, "query": payload.get("query")}


def save(market: str, symbol: str, query: str, day: str, result: Dict[str, Any], root: Optional[Path] = None) -> Dict[str, Any]:
    if not isinstance(result, dict):
        raise ValueError("result must be a dict")
    encoded = json.dumps(result, ensure_ascii=False)
    if len(encoded.encode("utf-8")) > MAX_RESULT_BYTES:
        raise ValueError("result is too large to cache")
    path = cache_path(market, symbol, query, day, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "market": str(market).lower(),
        "symbol": str(symbol).upper(),
        "query": str(query),
        "day": str(day),
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "result": result,
        "version": 1,
    }
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)
    return {"saved": True, "path": str(path), "key": path.stem}

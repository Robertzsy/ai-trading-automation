"""Offline security lookup. Only explicit catalogue refresh contacts a provider."""
from __future__ import annotations

import json
import re
import threading
import unicodedata
import time
from functools import lru_cache
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any, Mapping

from engine.atomic_write import write_text_atomic
from engine.paths import runtime_dir

MARKETS = {"cn", "hk", "us", "etf"}
_REFRESH_LOCK = threading.Lock()
_CACHE_LOCK = threading.Lock()
_FILE_CACHE: dict[str, tuple[int, int, dict]] = {}
_MONGO_CACHE: dict[tuple[str, str], tuple[float, dict]] = {}
# Aliases supplement identities already present in the directory; they never
# create a security or cross-list one ticker into a different market.
_ALIASES = {
    ("hk", "00700"): ["腾讯", "騰訊", "騰訊控股", "Tencent", "tengxun"],
    ("hk", "09988"): ["阿里", "阿里巴巴", "Alibaba"],
    ("us", "AAPL"): ["苹果", "蘋果", "Apple"],
    ("us", "MSFT"): ["微软", "微軟", "Microsoft"],
    ("us", "NVDA"): ["英伟达", "輝達", "Nvidia"],
    ("us", "TSLA"): ["特斯拉", "Tesla"],
}


def _text(value: Any) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).strip()


@lru_cache(maxsize=100_000)
def _key(value: str) -> str:
    return re.sub(r"[\s\W_]+", "", _text(value).casefold())


def canonical_symbol(value: Any, market: str) -> str:
    symbol = _text(value).upper()
    tag = re.search(r"^(HK|SH|SZ|BJ)(?=\d)|\.(HK|SH|SZ|BJ|US)$", symbol)
    if tag:
        explicit = tag.group(1) or tag.group(2)
        expected = "hk" if explicit == "HK" else "us" if explicit == "US" else "cn"
        if market != expected and not (market == "etf" and expected == "cn"):
            return ""
    symbol = re.sub(r"^(HK|SH|SZ|BJ)(?=\d)", "", symbol)
    symbol = re.sub(r"\.(HK|SH|SZ|BJ|US)$", "", symbol)
    if market == "hk" and re.fullmatch(r"\d{1,5}", symbol):
        return symbol.zfill(5)
    if market in {"cn", "etf"} and re.fullmatch(r"\d{1,6}", symbol):
        return symbol.zfill(6)
    if market == "us" and re.fullmatch(r"[A-Z][A-Z0-9.-]{0,15}", symbol):
        return symbol
    return ""


def _rows(payload: Mapping[str, Any], market: str) -> list[dict]:
    output = {}
    for row in payload.get("data", []):
        if not isinstance(row, Mapping):
            continue
        symbol = canonical_symbol(row.get("symbol", row.get("code")), market)
        if not symbol:
            continue
        name = _text(row.get("name"))[:200]
        extra = row.get("aliases", [])
        aliases = list(extra) if isinstance(extra, list) else []
        aliases.extend(_ALIASES.get((market, symbol), []))
        aliases = list(dict.fromkeys(_text(value)[:100] for value in aliases if _text(value)))
        output[symbol] = {"symbol": symbol, "name": name, "market": market, "aliases": aliases}
    return list(output.values())


def _file_payload(path, market: str) -> dict | None:
    try:
        stat = path.stat()
        with _CACHE_LOCK:
            cached = _FILE_CACHE.get(str(path))
        if cached and cached[:2] == (stat.st_mtime_ns, stat.st_size):
            return cached[2]
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            return None
        if payload.get("market") and payload["market"] != market:
            return None
        payload = {**payload, "data": _rows(payload, market)}
        with _CACHE_LOCK:
            _FILE_CACHE[str(path)] = (stat.st_mtime_ns, stat.st_size, payload)
        return payload
    except (OSError, ValueError):
        return None


def load_catalog(market: str) -> dict:
    for path, backend in [
        (runtime_dir() / "security-catalog" / f"{market}.json", "local-catalog"),
        (runtime_dir() / "screener" / f"discovery-{market}.json", "screening-json"),
    ]:
        payload = _file_payload(path, market)
        if payload is not None:
            return {**payload, "backend": backend}
    cache_key = (str(runtime_dir()), market)
    with _CACHE_LOCK:
        cached = _MONGO_CACHE.get(cache_key)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    # Reuse the configured store, never discover the market or start screening
    # while a user types. Missing MongoDB is a supported JSON-only deployment.
    try:
        from engine.config import cfg
        from engine.screening.storage import get_screening_store
        store = get_screening_store(cfg.screening)
        if store is not None:
            payload = store.read_discovery(market, now=datetime.now(timezone.utc),
                                           refresh_minutes=60 * 24 * 365 * 20, limit=0)
            if payload:
                # Mongo read_discovery's scope means requested limit, not actual
                # coverage. Do not mislabel a 500-record discovery as complete.
                catalog = {**payload, "data": _rows(payload, market), "backend": "mongodb", "scope": "cached"}
                with _CACHE_LOCK:
                    _MONGO_CACHE[cache_key] = (time.monotonic() + 30, catalog)
                return catalog
    except Exception:
        pass
    catalog = {"data": [], "backend": "empty", "scope": "empty", "generated_at": None}
    with _CACHE_LOCK:
        _MONGO_CACHE[cache_key] = (time.monotonic() + 30, catalog)
    return catalog


def _match(query: str, row: dict, *, allow_fuzzy: bool = True) -> tuple[int, str]:
    needle = _key(query)
    symbol = row["symbol"]
    if canonical_symbol(query, row["market"]) == symbol:
        return 100, "code"
    candidates = [(row["name"], "name"), *[(alias, "alias") for alias in row["aliases"]]]
    for value, kind in candidates:
        if needle == _key(value):
            return 99, kind
    if _key(symbol).startswith(needle):
        return 96, "code_prefix"
    for value, kind in candidates:
        if needle and needle in _key(value):
            return 94 if _key(value).startswith(needle) else 90, kind
    # Never guess mistyped numeric codes. For names require shared characters
    # and >=2 characters; two Chinese characters with one typo can be suggested.
    if not allow_fuzzy or len(needle) < 2 or needle.isdecimal():
        return 0, ""
    best = 0.0
    for value, _ in candidates:
        haystack = _key(value)
        if not set(needle).intersection(haystack):
            continue
        chunks = [haystack] + [haystack[i:i + len(needle)] for i in range(max(0, len(haystack) - len(needle) + 1))]
        best = max(best, *(SequenceMatcher(None, needle, chunk).ratio() for chunk in chunks))
    threshold = 0.5 if len(needle) == 2 and re.search(r"[\u3400-\u9fff]", needle) else 0.72
    return (round(60 + best * 20), "similar") if best >= threshold else (0, "")


def search_securities(query: str, market: str, limit: int = 8) -> dict:
    if market not in MARKETS:
        raise ValueError("market 必须是 cn、hk、us 或 etf")
    query = _text(query)
    if len(query) > 80:
        raise ValueError("股票查询不能超过 80 字符")
    catalog = load_catalog(market)
    matches = []
    if _key(query):
        for row in catalog["data"]:
            score, kind = _match(query, row, allow_fuzzy=False)
            if score:
                matches.append({**row, "match": kind, "score": score})
        if not matches:
            for row in catalog["data"]:
                score, kind = _match(query, row)
                if score:
                    matches.append({**row, "match": kind, "score": score})
    matches.sort(key=lambda row: (-row["score"], row["symbol"]))
    return {"market": market, "query": query, "results": matches[:max(1, min(20, limit))],
            "catalog": {"count": len(catalog["data"]), "backend": catalog["backend"],
                        "scope": catalog.get("scope", "cached"), "generated_at": catalog.get("generated_at")},
            "local_only": True}


def refresh_catalog(market: str) -> dict:
    if market not in MARKETS:
        raise ValueError("market 必须是 cn、hk、us 或 etf")
    if not _REFRESH_LOCK.acquire(blocking=False):
        raise ValueError("股票目录正在更新，请稍后再试")
    try:
        from engine.data import fetcher
        payload = fetcher.market_list(market, limit=0, timeout=180)
        rows = _rows(payload, market)
        if not rows:
            raise ValueError("数据源未返回股票目录，原目录已保留")
        catalog = {"market": market, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   "source": payload.get("source", "market-data-provider"),
                   "scope": payload.get("scope", "cached"), "data": rows}
        path = runtime_dir() / "security-catalog" / f"{market}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        write_text_atomic(path, json.dumps(catalog, ensure_ascii=False))
        return {"market": market, "count": len(rows), "scope": catalog["scope"], "generated_at": catalog["generated_at"]}
    finally:
        _REFRESH_LOCK.release()

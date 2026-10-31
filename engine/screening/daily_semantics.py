"""One entity-level interpretation per daily brief, shared by all markets."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
import urllib.request
from pathlib import Path
from typing import Any, Mapping

from engine.atomic_write import write_text_atomic
from engine.paths import runtime_dir
from engine.runtime_lock import ProcessLease
from engine.screening.daily_signals import _matches

PROMPT = Path(__file__).with_name("daily_semantics_prompt.txt").read_text(encoding="utf-8")
SCHEMA_VERSION = "entity-v2-" + hashlib.sha256(PROMPT.encode()).hexdigest()[:12]
MODEL = "deepseek-flash"
API_URL = "https://api.deepseek.com/chat/completions"
_TYPES = {"financial", "operational", "regulatory", "product", "market_price", "personal_wealth", "commentary", "other"}
_NEUTRAL = {"product", "market_price", "personal_wealth", "commentary", "other"}
logger = logging.getLogger("ai-trading-automation.screening")


def prepare_payload(daily: Mapping[str, Any]) -> dict:
    from engine.data.securities import load_catalog

    events = []
    for event in daily.get("events", []):
        texts = [s.strip() for s in re.split(r"(?<=[。！？])|\n", event["text"]) if s.strip()]
        events.append({"event_id": event["event_id"], "paragraphs": [
            {"id": f"{event['event_id']}:{i}", "text": text} for i, text in enumerate(texts)
        ]})
    all_text = "\n".join(e["text"] for e in daily.get("events", []))
    catalog = {}
    # Only public security identities that can match the report are sent.
    # Holdings, account settings and private research are never part of this payload.
    for market in ("cn", "hk", "us"):
        for row in load_catalog(market).get("data", []):
            names = [row.get("name", ""), *row.get("aliases", [])]
            if row.get("symbol") and any(_matches(str(name), all_text) for name in names):
                catalog[(market, row["symbol"])] = {"market": market, "symbol": row["symbol"], "name": row.get("name", "")}
    return {"catalog": list(catalog.values()), "events": events}


def _request(payload: dict) -> tuple[dict, dict]:
    from engine.secret_store import load_secret

    key = os.getenv("DEEPSEEK_API_KEY") or load_secret("DEEPSEEK_API_KEY")
    if not key:
        raise RuntimeError("credential_unavailable")
    body = json.dumps({"model": MODEL, "messages": [
        {"role": "system", "content": PROMPT},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ], "thinking": {"type": "disabled"}, "temperature": 0, "max_tokens": 16384,
        "response_format": {"type": "json_object"}}, ensure_ascii=False).encode()
    if len(body) > 300_000:
        raise ValueError("daily_payload_too_large")
    request = urllib.request.Request(API_URL, data=body, headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json",
    })
    with urllib.request.urlopen(request, timeout=40) as response:
        answer = json.load(response)
    usage = answer.get("usage", {})
    metadata = {"model": answer.get("model", MODEL), "usage": usage}
    # Do not store provider reasoning, credentials or raw request headers.
    choice = answer["choices"][0]
    if choice.get("finish_reason") != "stop":
        raise ValueError("daily_response_incomplete")
    return json.loads(choice["message"]["content"]), metadata


def validate_output(payload: dict, answer: dict) -> dict:
    events = {e["event_id"]: e for e in payload["events"]}
    rows = answer.get("events", [])
    ids = [row.get("event_id") for row in rows]
    if len(ids) != len(set(ids)) or set(ids) != set(events):
        raise ValueError("daily_event_coverage")
    symbols = {(r["market"], r["symbol"]) for r in payload["catalog"]}
    normalized = []
    for row in rows:
        paragraphs = {p["id"]: p["text"] for p in events[row["event_id"]]["paragraphs"]}
        entities = []
        for entity in row.get("entities", []):
            refs = entity.get("paragraph_ids", [])
            kind, direction = entity.get("event_type"), entity.get("direction")
            canonical = entity.get("canonical_event_id")
            if kind not in _TYPES or direction not in {"positive", "negative", "neutral"}:
                raise ValueError("daily_invalid_direction")
            if not refs or any(ref not in paragraphs for ref in refs) or canonical not in events:
                raise ValueError("daily_invalid_evidence")
            if kind in _NEUTRAL and direction != "neutral":
                raise ValueError("daily_nonoperating_direction")
            mapped = entity.get("symbols", [])
            if any((s.get("market"), s.get("symbol")) not in symbols for s in mapped):
                raise ValueError("daily_invalid_security")
            entities.append({"name": str(entity.get("name", "")), "event_type": kind, "direction": direction,
                             "symbols": mapped, "canonical_event_id": canonical,
                             "evidence": [paragraphs[ref] for ref in refs]})
        normalized.append({"event_id": row["event_id"], "entities": entities})
    return {"events": normalized}


def apply_output(daily: Mapping[str, Any], answer: dict, market: str, metadata: dict) -> dict:
    originals = {e["event_id"]: e for e in daily.get("events", [])}
    groups = {}
    for row in answer["events"]:
        source = originals.get(row["event_id"])
        if source is None:  # A future-dated row may now be omitted by the loader.
            continue
        for entity in row["entities"]:
            if entity["event_type"] in {"personal_wealth", "market_price"}:
                continue
            for ref in entity["symbols"]:
                if ref["market"] != market:
                    continue
                key = (entity["canonical_event_id"], ref["symbol"])
                event = {**source, "event_id": entity["canonical_event_id"], "symbols": [ref["symbol"]],
                         "markets": [market], "text": "", "sectors": [], "entity_resolved": True,
                         "direction": entity["direction"], "direction_source": "entity_semantics",
                         "event_type": entity["event_type"], "evidence": entity["evidence"]}
                if key not in groups:
                    groups[key] = event
                elif groups[key]["direction"] != event["direction"]:
                    groups[key]["direction"] = "neutral"
    return {**daily, "events": list(groups.values()), "semantic": metadata}


def _fallback(daily: Mapping[str, Any], status: str) -> dict:
    # Ambiguous keyword polarity may recall an entity but does not invent an
    # operating catalyst when semantic processing is unavailable.
    return {**daily, "events": [{**e, "direction": e["direction"] if e.get("direction_source") == "explicit" else "neutral"}
                               for e in daily.get("events", [])], "semantic": {"status": status, "version": SCHEMA_VERSION}}


def enrich_daily(daily: Mapping[str, Any], market: str, settings: Mapping[str, Any]) -> dict:
    config = settings.get("daily_semantics", {})
    if config is False or isinstance(config, Mapping) and not config.get("enabled", True):
        return _fallback(daily, "disabled")
    if not daily.get("hash") or not daily.get("events") or daily.get("status") == "background":
        return _fallback(daily, "not_needed")
    active_events = hashlib.sha256(json.dumps([(e["event_id"], e["text"]) for e in daily["events"]], ensure_ascii=False).encode()).hexdigest()
    identity = hashlib.sha256((SCHEMA_VERSION + str(daily["hash"]) + active_events).encode()).hexdigest()
    path = runtime_dir() / "macro" / "selection-cache" / (identity + ".json")

    def cached():
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            if value.get("version") != SCHEMA_VERSION or value.get("hash") != daily["hash"]:
                return None
            if value.get("status") == "failed":
                return _fallback(daily, "temporarily_unavailable") if time.time() - value["created_at"] < 300 else None
            return apply_output(daily, value["output"], market, {"status": "cached", "version": SCHEMA_VERSION, **value["metadata"]})
        except (OSError, ValueError, KeyError, TypeError):
            return None

    result = cached()
    if result is not None:
        return result
    lease = ProcessLease(path.with_suffix(".lock"))
    deadline = time.monotonic() + 45
    while True:
        try:
            lease.acquire()
            break
        except RuntimeError:
            result = cached()
            if result is not None:
                return result
            if time.monotonic() >= deadline:
                return _fallback(daily, "processing")
            time.sleep(.15)
    try:
        result = cached()
        if result is not None:
            return result
        payload = prepare_payload(daily)
        if not payload["catalog"]:
            return _fallback(daily, "no_matching_securities")
        started = time.monotonic()
        answer, metadata = _request(payload)
        metadata["seconds"] = round(time.monotonic() - started, 3)
        output = validate_output(payload, answer)
        try:
            write_text_atomic(path, json.dumps({"version": SCHEMA_VERSION, "hash": daily["hash"], "status": "ready",
                             "created_at": time.time(), "output": output, "metadata": metadata}, ensure_ascii=False))
        except OSError:
            metadata["cache_write_failed"] = True
            logger.warning("Daily interpretation cache could not be persisted")
        return apply_output(daily, output, market, {"status": "generated", "version": SCHEMA_VERSION, **metadata})
    except Exception as exc:
        # Exception strings can contain provider bodies: log only the type.
        logger.warning("Daily entity interpretation unavailable: %s", type(exc).__name__)
        try:
            write_text_atomic(path, json.dumps({"version": SCHEMA_VERSION, "hash": daily["hash"], "status": "failed", "created_at": time.time()}))
        except OSError:
            pass
        return _fallback(daily, "temporarily_unavailable")
    finally:
        lease.release()

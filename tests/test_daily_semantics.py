import copy
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from engine.screening import daily_semantics as semantic
from engine.screening import daily_signals as signals


def report():
    return {"hash": "fixture-hash", "date": "2026-10-31", "status": "available", "events": [
        {"event_id": eid, "text": "苹果确认产品故障", "summary": "产品故障", "source_url": "https://example.test/" + eid,
         "freshness": 1, "direction": "neutral", "direction_source": "keywords", "importance": "high", "symbols": [], "sectors": [], "markets": []}
        for eid in ("first", "duplicate")]}


def payload():
    return {"catalog": [{"market": "us", "symbol": "AAPL", "name": "Apple"}], "events": [
        {"event_id": e, "paragraphs": [{"id": e + ":0", "text": "苹果确认产品故障"}]} for e in ("first", "duplicate")]}


def answer():
    return {"events": [{"event_id": e, "entities": [{"name": "苹果", "event_type": "operational", "direction": "negative",
        "paragraph_ids": [e + ":0"], "symbols": [{"market": "us", "symbol": "AAPL"}], "canonical_event_id": "first"}]} for e in ("first", "duplicate")]}


def test_verified_entity_events_are_counted_once_without_cross_entity_bleed():
    output = semantic.validate_output(payload(), answer())
    daily = semantic.apply_output(report(), output, "us", {})
    assert signals.signals_for({"symbol": "AAPL"}, daily, "us")["daily_adjustment"] == -15
    assert signals.signals_for({"symbol": "MSFT", "name": "苹果"}, daily, "us")["daily_adjustment"] == 0
    assert semantic.apply_output(report(), output, "etf", {})["events"] == []
    assert daily["events"][0]["evidence"] == ["苹果确认产品故障"]


@pytest.mark.parametrize("invalid", ["security", "evidence", "coverage", "wealth"])
def test_invalid_model_output_does_not_reach_ranking(invalid):
    value = answer()
    entity = value["events"][0]["entities"][0]
    if invalid == "security": entity["symbols"][0]["symbol"] = "NOT_IN_CATALOG"
    if invalid == "evidence": entity["paragraph_ids"] = ["invented"]
    if invalid == "coverage": value["events"].pop()
    if invalid == "wealth": entity["event_type"] = "personal_wealth"
    with pytest.raises(ValueError): semantic.validate_output(payload(), value)


def test_parallel_markets_share_one_model_call_and_refresh_freshness(monkeypatch, tmp_path):
    monkeypatch.setattr(semantic, "runtime_dir", lambda: tmp_path)
    monkeypatch.setattr(semantic, "prepare_payload", lambda daily: payload())
    calls = []
    def request(_):
        calls.append(1);time.sleep(.2)
        return answer(), {"model": "fixture", "usage": {"prompt_tokens": 100, "completion_tokens": 20}}
    monkeypatch.setattr(semantic, "_request", request)
    with ThreadPoolExecutor(max_workers=4) as pool:
        output = list(pool.map(lambda market: semantic.enrich_daily(report(), market, {}), ["cn", "us", "hk", "etf"]))
    assert len(calls) == 1
    assert sum(bool(r["events"]) for r in output) == 1
    later = report()
    for e in later["events"]:e["freshness"] = .35
    reused = semantic.enrich_daily(later, "us", {})
    assert signals.signals_for({"symbol": "AAPL"}, reused, "us")["daily_adjustment"] == -5.25
    assert len(calls) == 1


def test_model_failure_has_cooldown_and_preserves_quantitative_flow(monkeypatch, tmp_path):
    monkeypatch.setattr(semantic, "runtime_dir", lambda: tmp_path)
    monkeypatch.setattr(semantic, "prepare_payload", lambda daily: payload())
    calls = []
    def request(_):
        calls.append(1);raise TimeoutError("not logged")
    monkeypatch.setattr(semantic, "_request", request)
    first = semantic.enrich_daily(report(), "us", {})
    second = semantic.enrich_daily(report(), "hk", {})
    assert first["semantic"]["status"] == second["semantic"]["status"] == "temporarily_unavailable"
    assert len(calls) == 1
    assert all(e["direction"] == "neutral" for e in first["events"])


def test_payload_contains_only_matching_public_identities(monkeypatch):
    from engine.data import securities
    monkeypatch.setattr(securities, "load_catalog", lambda market: {"data": [
        {"symbol": "AAPL", "name": "Apple", "aliases": ["苹果"], "secret": "excluded"},
        {"symbol": "MSFT", "name": "Microsoft", "aliases": [], "holdings": 100}] if market == "us" else []})
    result = semantic.prepare_payload(report())
    assert result["catalog"] == [{"market": "us", "symbol": "AAPL", "name": "Apple"}]
    assert set(result) == {"catalog", "events"}

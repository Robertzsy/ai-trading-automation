from __future__ import annotations

import json
import pytest

from engine.data import securities


@pytest.fixture
def directory(tmp_path, monkeypatch):
    monkeypatch.setattr(securities, "runtime_dir", lambda: tmp_path)
    monkeypatch.setattr("engine.data.fetcher.market_list", lambda *a, **k: pytest.fail("search must stay offline"))
    path = tmp_path / "screener"
    path.mkdir()
    rows = {"hk": [{"symbol": "00700", "name": "腾讯控股"}, {"symbol": "09988", "name": "阿里巴巴-W"}, {"symbol": "00701", "name": "北海集团"}],
            "cn": [{"symbol": "600519", "name": "贵州茅台"}, {"symbol": "000858", "name": "五粮液"}],
            "us": [{"symbol": "AAPL", "name": "Apple Inc."}, {"symbol": "BRK.B", "name": "Berkshire Hathaway Inc."}],
            "etf": [{"symbol": "510300", "name": "沪深300ETF"}]}
    for market, data in rows.items():
        (path / f"discovery-{market}.json").write_text(json.dumps({"data": data, "scope": "bounded", "generated_at": "2026-10-11T10:00:00+08:00"}, ensure_ascii=False), encoding="utf-8")
    return tmp_path


@pytest.mark.parametrize("query", ["腾讯", "騰訊", "Tencent", "700", "HK00700", "00700.HK", "００７００"])
def test_tencent_name_alias_and_code_are_same_market(directory, query):
    result = securities.search_securities(query, "hk")
    assert result["local_only"] is True
    assert result["results"][0]["symbol"] == "00700"
    assert result["results"][0]["name"] == "腾讯控股"
    assert result["catalog"]["scope"] == "bounded"


def test_typo_only_suggests_and_does_not_mutate_directory(directory):
    path = directory / "screener/discovery-hk.json"
    original = path.read_bytes()
    result = securities.search_securities("腾迅", "hk")
    assert result["results"][0]["symbol"] == "00700"
    assert result["results"][0]["match"] == "similar"
    assert path.read_bytes() == original
    assert securities.search_securities("腾讯", "cn")["results"] == []
    assert securities.canonical_symbol("00700.HK", "cn") == ""


def test_english_company_name_and_class_share_code(directory):
    assert securities.search_securities("苹果", "us")["results"][0]["symbol"] == "AAPL"
    assert securities.search_securities("appl", "us")["results"][0]["symbol"] == "AAPL"
    assert securities.search_securities("BRK.B", "us")["results"][0]["symbol"] == "BRK.B"
    assert securities.search_securities("贵州", "cn")["results"][0]["symbol"] == "600519"


def test_direct_name_match_skips_fuzzy_scan(directory, monkeypatch):
    monkeypatch.setattr(securities, "SequenceMatcher", lambda *args: pytest.fail("direct names do not need fuzzy scanning"))
    assert securities.search_securities("腾讯", "hk")["results"][0]["symbol"] == "00700"


def test_existing_mongo_directory_is_a_local_fallback(tmp_path, monkeypatch):
    monkeypatch.setattr(securities, "runtime_dir", lambda: tmp_path)
    monkeypatch.setattr("engine.data.fetcher.market_list", lambda *a, **k: pytest.fail("unexpected network"))
    calls = []
    class Store:
        def read_discovery(self, market, **options):
            calls.append(market)
            return {"scope": "full-market", "data": [{"symbol": "00700", "name": "腾讯控股"}]}
    monkeypatch.setattr("engine.screening.storage.get_screening_store", lambda settings: Store())
    for _ in range(2):
        result = securities.search_securities("腾讯", "hk")
        assert result["results"][0]["symbol"] == "00700"
        assert result["catalog"]["backend"] == "mongodb"
        assert result["catalog"]["scope"] == "cached"
    assert calls == ["hk"]


def test_query_validation_and_literal_regex_characters(directory):
    assert securities.search_securities(".*", "hk")["results"] == []
    assert len(securities.search_securities("007", "hk", limit=1)["results"]) == 1
    assert securities.search_securities("", "hk")["results"] == []
    for query, market in [("x" * 81, "hk"), ("腾讯", "../hk")]:
        with pytest.raises(ValueError):
            securities.search_securities(query, market)


def test_empty_directory_and_failed_mongo_do_not_contact_provider(tmp_path, monkeypatch):
    monkeypatch.setattr(securities, "runtime_dir", lambda: tmp_path)
    monkeypatch.setattr("engine.screening.storage.get_screening_store", lambda settings: None)
    monkeypatch.setattr("engine.data.fetcher.market_list", lambda *a, **k: pytest.fail("unexpected network"))
    result = securities.search_securities("腾讯", "hk")
    assert result["results"] == [] and result["catalog"]["backend"] == "empty"


def test_explicit_refresh_persists_identity_only_and_retains_old_on_failure(directory, monkeypatch):
    calls = []
    def provider(market, **options):
        calls.append((market, options))
        return {"scope": "full-market", "source": "provider", "data": [{"symbol": "00700", "name": "腾讯控股", "price": 600}, {"symbol": "01234", "name": "新标的"}]}
    monkeypatch.setattr("engine.data.fetcher.market_list", provider)
    assert securities.refresh_catalog("hk")["count"] == 2
    assert calls == [("hk", {"limit": 0, "timeout": 180})]
    path = directory / "security-catalog/hk.json"
    saved = path.read_bytes()
    assert "price" not in json.loads(saved)["data"][0]
    assert securities.search_securities("新标的", "hk")["results"][0]["symbol"] == "01234"
    assert len(calls) == 1
    monkeypatch.setattr("engine.data.fetcher.market_list", lambda *a, **k: {"data": []})
    with pytest.raises(ValueError):
        securities.refresh_catalog("hk")
    assert path.read_bytes() == saved

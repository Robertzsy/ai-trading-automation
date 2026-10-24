"""Engine HTTP command API smoke tests (loopback, in-process)."""
from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request

import pytest

from engine.api import server


@pytest.fixture
def api(monkeypatch):
    # Deterministic auth surface: every test starts token-free regardless of
    # any ambient ATA_ACCESS_TOKEN left by unrelated tooling.
    monkeypatch.setenv("ATA_ACCESS_TOKEN", "")
    httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server._Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    port = httpd.server_address[1]
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        httpd.server_close()


def _get(base: str, path: str):
    with urllib.request.urlopen(base + path, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def _post(base: str, path: str, payload: dict) -> tuple[int, dict]:
    request = urllib.request.Request(
        base + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def test_fundamentals_route_validates_input_and_uses_the_key_free_provider(api, monkeypatch):
    calls = []
    def fetch(market, symbol):
        calls.append((market, symbol))
        return {"status": "ok", "provider": "akshare:em", "records": []}
    monkeypatch.setattr("engine.data.fundamentals.fetch_fundamentals", fetch)
    payload = _get(api, "/api/research/fundamentals?market=cn&symbol=600519")
    assert payload["provider"] == "akshare:em" and calls == [("cn", "600519")]
    with pytest.raises(urllib.error.HTTPError) as error:
        _get(api, "/api/research/fundamentals?symbol=600519")
    assert error.value.code == 400


def test_health_endpoint(api):
    payload = _get(api, "/api/health")
    assert payload["ok"] is True
    assert payload["service"] == "ai-trading-automation-engine"


def test_credential_records_require_revision_and_preserve_concurrent_writes(api, monkeypatch, tmp_path):
    from engine import paths, secret_store
    monkeypatch.setattr(paths, "data_root", lambda: tmp_path)
    monkeypatch.setattr(secret_store, "dpapi_protect", lambda data: b"protected:" + data)
    monkeypatch.setattr(secret_store, "dpapi_unprotect", lambda data: data.removeprefix(b"protected:"))
    revision = _get(api, "/api/credentials/records?key=llm/model")["revision"]
    assert _post(api, "/api/credentials/records", {"key": "llm/model"})[0] == 400
    payload = {"key": "llm/model", "record": {"kind": "api-key", "key": "private"}, "revision": revision}
    assert _post(api, "/api/credentials/records", payload)[0] == 200
    assert _post(api, "/api/credentials/records", payload)[0] == 409
    assert _get(api, "/api/credentials/records")["records"] == [{"key": "llm/model", "kind": "api-key"}]


def test_local_security_lookup_and_explicit_refresh_routes(api, monkeypatch):
    calls = []
    def search(query, market, limit):
        calls.append((query, market, limit))
        return {"results": [{"symbol": "00700", "name": "腾讯控股", "market": market}], "local_only": True}
    monkeypatch.setattr("engine.data.securities.search_securities", search)
    payload = _get(api, "/api/securities/search?market=hk&q=%E8%85%BE%E8%AE%AF")
    assert calls == [("腾讯", "hk", 8)] and payload["local_only"]
    monkeypatch.setattr("engine.data.securities.refresh_catalog", lambda market: {"market": market, "count": 5000})
    status, payload = _post(api, "/api/securities/refresh", {"market": "hk"})
    assert status == 200 and payload["count"] == 5000
    with pytest.raises(urllib.error.HTTPError) as error:
        _get(api, "/api/securities/refresh")
    assert error.value.code == 404


def test_raw_research_archive_accepts_more_than_a_compact_checkpoint(api, monkeypatch, tmp_path):
    from engine import analysis_reports

    monkeypatch.setattr(analysis_reports, "_analysis_dir", lambda: tmp_path / "analysis_runs")
    long_text = "research evidence " * 70_000
    status, payload = _post(api, "/api/analysis/runs/archive", {
        "cycle_id": "large-archive", "stages": {"base_research": {"summary": long_text}},
    })
    assert status == 200
    assert payload["ok"] is True
    saved = tmp_path / "analysis_runs" / "archive" / "large-archive" / "base_research.json"
    assert json.loads(saved.read_text(encoding="utf-8"))["summary"] == long_text
    restored = _get(api, "/api/analysis/evidence?cycle_id=large-archive&stage=base_research")
    assert restored["evidence"]["summary"] == long_text
    for query in ("cycle_id=..&stage=base_research", "cycle_id=large-archive&stage=../config"):
        with pytest.raises(urllib.error.HTTPError) as error:
            _get(api, "/api/analysis/evidence?" + query)
        assert error.value.code == 400


def test_large_multistock_checkpoint_commits_and_survives_http_replay(api, monkeypatch, tmp_path):
    from engine import analysis_runs, analysis_reports
    monkeypatch.setattr(analysis_runs, "runtime_dir", lambda: tmp_path / "runtime")
    monkeypatch.setattr(analysis_reports, "_analysis_dir", lambda: tmp_path / "runtime/analysis_runs")
    symbols = [f"{600000 + i}" for i in range(20)]
    _post(api, "/api/analysis/runs/start", {"cycle_id": "20-stock", "market": "cn", "symbols": symbols})
    evidence = [{"symbol": symbol, "analyses": [{"summary": "verified evidence " * 1500} for _ in range(4)]} for symbol in symbols]
    compact = [{"symbol": row["symbol"], "analyses": [{"summary": item["summary"][:1600]} for item in row["analyses"]]} for row in evidence]
    body = {"cycle_id": "20-stock", "stage": "base_research", "result": compact, "archives": {"base_research": evidence}, "agents_started": 80}
    assert len(json.dumps(body).encode()) > 1_000_000
    code, first = _post(api, "/api/analysis/runs/checkpoint", body)
    assert code == 200 and len(first["analysis"]["checkpoints"]["base_research"]["result"]) == 20
    assert _post(api, "/api/analysis/runs/checkpoint", body)[1]["analysis"]["checkpoints"] == first["analysis"]["checkpoints"]
    restored = _get(api, "/api/analysis/evidence?cycle_id=20-stock&stage=base_research")["evidence"]
    assert restored == evidence


def test_rejected_bounded_body_is_drained_for_a_readable_error(api):
    # /start keeps the small control-message cap. It must return JSON rather
    # than aborting the socket while a Windows client is uploading the body.
    code, result = _post(api, "/api/analysis/runs/start", {"padding": "x" * 1_070_000})
    assert code == 400 and result["error"] == "invalid JSON body"


def test_status_endpoint_reports_engine_state(api):
    payload = _get(api, "/api/status")
    assert payload["ok"] is True
    assert "control" in payload
    assert "markets" in payload
    assert payload["operation_mode"] in {"manual", "automatic"}


def test_unknown_route_returns_404(api):
    status, payload = _post(api, "/api/unknown", {})
    assert status == 404
    assert payload["ok"] is False


def test_invalid_json_body_is_rejected(api):
    request = urllib.request.Request(
        api + "/api/commands/issue",
        data=b"{not json",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=5)
        raise AssertionError("expected 400")
    except urllib.error.HTTPError as exc:
        assert exc.code == 400


def test_unknown_command_returns_dispatch_error(api):
    status, payload = _post(api, "/api/commands/issue", {"command": "bogus_command", "payload": {}})
    assert status == 500
    assert payload["ok"] is False


def test_authorized_mode_rejects_missing_token(monkeypatch, api):
    monkeypatch.setenv("ATA_ACCESS_TOKEN", "secret-token")
    status, payload = _post(api, "/api/commands/issue", {"command": "status", "payload": {}})
    assert status == 403


def test_credentials_roundtrip(monkeypatch, api):
    stored = {}

    def fake_save(key, value):
        stored[key] = value

    def fake_load(key):
        return stored.get(key)

    def fake_delete(key):
        stored.pop(key, None)

    monkeypatch.setattr("engine.secret_store.save_secret", fake_save)
    monkeypatch.setattr("engine.secret_store.load_secret", fake_load)
    monkeypatch.setattr("engine.secret_store.delete_secret", fake_delete)

    assert _get(api, "/api/credentials/resolve?ref=DEEPSEEK_API_KEY")["configured"] is False
    status, payload = _post(api, "/api/credentials/set", {"ref": "DEEPSEEK_API_KEY", "value": "sk-test"})
    assert status == 200 and payload["configured"] is True
    resolved = _get(api, "/api/credentials/resolve?ref=DEEPSEEK_API_KEY")
    assert resolved["configured"] is True and resolved["value"] == "sk-test"
    _post(api, "/api/credentials/unset", {"ref": "DEEPSEEK_API_KEY"})
    assert _get(api, "/api/credentials/resolve?ref=DEEPSEEK_API_KEY")["configured"] is False


def test_setup_status_and_complete(monkeypatch, api, tmp_path):
    from engine import paths

    marker_dir = tmp_path / "runtime"
    marker_dir.mkdir()
    monkeypatch.setattr(paths, "runtime_dir", lambda: marker_dir)
    from engine.portfolio import account as account_module

    portfolio = tmp_path / "portfolio.json"
    monkeypatch.setattr(account_module, "_path", lambda: portfolio)
    monkeypatch.setattr(account_module, "exists", lambda: False)
    monkeypatch.setattr(
        "engine.portfolio.account.save",
        lambda data: portfolio.write_text(json.dumps(data), encoding="utf-8"),
    )

    assert _get(api, "/api/setup/status")["first_run"] is True
    status, payload = _post(api, "/api/setup/complete", {"import_from": ""})
    assert status == 200
    assert (marker_dir / "setup.complete").exists()
    assert _get(api, "/api/setup/status")["first_run"] is False
    assert portfolio.exists()

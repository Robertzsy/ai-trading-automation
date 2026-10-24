"""Encrypted record updates use an engine-owned compare-and-set boundary."""
from concurrent.futures import ThreadPoolExecutor
import json
import sys

import pytest

from engine import paths, secret_store


@pytest.mark.skipif(sys.platform != "win32", reason="native Windows DPAPI")
def test_native_dpapi_record_roundtrip_in_isolated_data_directory(monkeypatch, tmp_path):
    monkeypatch.setattr(paths, "data_root", lambda: tmp_path)
    key = "upgrade-fixture/record"
    record = {"kind": "grant", "payload": {"access_token": "synthetic-upgrade-token"}}
    revision = secret_store.read_credential_record(key)["revision"]
    assert secret_store.write_credential_record(key, record, revision)
    assert secret_store.read_credential_record(key)["record"] == record
    assert "synthetic-upgrade-token" not in (tmp_path / "secrets.enc").read_text(encoding="utf-8")
    assert secret_store.write_credential_record(key, None, secret_store.read_credential_record(key)["revision"])
    assert secret_store.read_credential_record(key)["record"] is None


@pytest.fixture
def store(monkeypatch, tmp_path):
    monkeypatch.setattr(paths, "data_root", lambda: tmp_path)
    monkeypatch.setattr(secret_store, "dpapi_protect", lambda data: b"protected:" + data)
    monkeypatch.setattr(secret_store, "dpapi_unprotect", lambda data: data.removeprefix(b"protected:"))
    return tmp_path


def test_records_are_separate_from_references_and_list_no_values(store):
    initial = secret_store.read_credential_record("llm-pi-ai/deepseek")
    record = {"kind": "api-key", "key": "not-for-logs", "env": {"REGION": "test"}}
    assert secret_store.write_credential_record("llm-pi-ai/deepseek", record, initial["revision"])
    assert secret_store.read_credential_record("llm-pi-ai/deepseek")["record"] == record
    assert secret_store.list_credential_records() == [{"key": "llm-pi-ai/deepseek", "kind": "api-key"}]
    assert "not-for-logs" not in (store / "secrets.enc").read_text(encoding="utf-8")
    secret_store.save_secret("DEEPSEEK_API_KEY", "legacy-ref")
    secret_store.delete_secret("DEEPSEEK_API_KEY")
    assert secret_store.read_credential_record("llm-pi-ai/deepseek")["record"] == record


def test_concurrent_refresh_never_overwrites_a_newer_record(store):
    key = "deepseek-account/session"
    revision = secret_store.read_credential_record(key)["revision"]
    with ThreadPoolExecutor(max_workers=2) as workers:
        accepted = list(workers.map(lambda n: secret_store.write_credential_record(
            key, {"kind": "grant", "payload": {"generation": n}}, revision
        ), [1, 2]))
    assert sum(accepted) == 1
    latest = secret_store.read_credential_record(key)
    assert not secret_store.write_credential_record(key, None, revision)
    assert secret_store.write_credential_record(key, None, latest["revision"])
    assert secret_store.list_credential_records() == []


@pytest.mark.parametrize("key,record", [
    ("../bad", {"kind": "api-key"}),
    ("llm/model", {"kind": "unknown"}),
    ("llm/model", {"kind": "grant"}),
    ("llm/model", {"kind": "api-key", "key": ""}),
    ("llm/model", {"kind": "api-key", "env": {"BAD=KEY": "x"}}),
    ("llm/model", {"kind": "grant", "payload": float("nan")}),
])
def test_invalid_record_never_changes_store(store, key, record):
    with pytest.raises(ValueError):
        secret_store.write_credential_record(key, record, "not-a-revision")
    assert not (store / "secrets.enc").exists()

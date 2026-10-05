"""Tests for engine.atomic_write.

The behaviour under test is a Windows-specific transient: os.replace fails with
PermissionError (WinError 5) while any other handle holds the destination
without sharing delete access. That surfaced as an intermittent full-suite
failure in test_analysis_runs, and historically as worker.json.tmp failing
during a command-bus heartbeat. These tests pin the retry rather than the
platform, so they are meaningful on Linux CI too.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from engine import atomic_write


def test_write_text_atomic_creates_and_overwrites(tmp_path):
    target = tmp_path / "state.json"
    atomic_write.write_text_atomic(target, json.dumps({"a": 1}))
    assert json.loads(target.read_text(encoding="utf-8")) == {"a": 1}

    atomic_write.write_text_atomic(target, json.dumps({"a": 2}))
    assert json.loads(target.read_text(encoding="utf-8")) == {"a": 2}


def test_write_text_atomic_leaves_no_temp_files(tmp_path):
    """A leftover temp file means a reader could later pick up a partial write."""
    target = tmp_path / "state.json"
    atomic_write.write_text_atomic(target, "{}")
    assert [p.name for p in tmp_path.iterdir()] == ["state.json"]


def test_write_text_atomic_uses_unique_temp_names(tmp_path, monkeypatch):
    """A fixed sibling name collides when two writers target the same file.

    The temp path must therefore carry pid/thread/uuid, so assert the name the
    implementation actually hands to os.replace rather than trusting a comment.
    """
    target = tmp_path / "state.json"
    seen: list[str] = []
    real_replace = atomic_write.os.replace

    def spy(source, destination):
        seen.append(Path(source).name)
        return real_replace(source, destination)

    monkeypatch.setattr(atomic_write.os, "replace", spy)
    for _ in range(3):
        atomic_write.write_text_atomic(target, "{}")

    assert len(seen) == 3
    assert len(set(seen)) == 3, f"temp names collided: {seen}"
    assert all(name.startswith(".state.json.") for name in seen)


def test_transient_share_violation_is_retried(tmp_path, monkeypatch):
    """A WinError 5-style refusal must not lose the write."""
    target = tmp_path / "state.json"
    target.write_text("old", encoding="utf-8")
    real_replace = atomic_write.os.replace
    attempts = {"count": 0}

    def flaky(source, destination):
        attempts["count"] += 1
        if attempts["count"] < 3:
            error = PermissionError(13, "access denied")
            error.winerror = 5
            raise error
        return real_replace(source, destination)

    monkeypatch.setattr(atomic_write.os, "replace", flaky)
    monkeypatch.setattr(atomic_write.time, "sleep", lambda _seconds: None)

    atomic_write.write_text_atomic(target, "new")

    assert attempts["count"] == 3
    assert target.read_text(encoding="utf-8") == "new"


def test_persistent_transient_failure_raises_after_bounded_attempts(tmp_path, monkeypatch):
    """A genuinely locked target must still surface an error, not spin forever."""
    target = tmp_path / "state.json"
    attempts = {"count": 0}

    def always_locked(source, destination):
        attempts["count"] += 1
        error = PermissionError(13, "access denied")
        error.winerror = 5
        raise error

    monkeypatch.setattr(atomic_write.os, "replace", always_locked)
    monkeypatch.setattr(atomic_write.time, "sleep", lambda _seconds: None)

    with pytest.raises(PermissionError):
        atomic_write.write_text_atomic(target, "new")

    assert attempts["count"] == atomic_write._ATTEMPTS


def test_non_transient_error_is_not_retried(tmp_path, monkeypatch):
    """A real permission/ACL denial should fail immediately, not after 1.2s."""
    target = tmp_path / "state.json"
    attempts = {"count": 0}

    def denied(source, destination):
        attempts["count"] += 1
        raise OSError(2, "no such file or directory")

    monkeypatch.setattr(atomic_write.os, "replace", denied)

    with pytest.raises(OSError):
        atomic_write.write_text_atomic(target, "new")

    assert attempts["count"] == 1


def test_atomic_replace_retries_then_succeeds(tmp_path, monkeypatch):
    source = tmp_path / "src.tmp"
    target = tmp_path / "dst.json"
    source.write_text("payload", encoding="utf-8")
    real_replace = atomic_write.os.replace
    attempts = {"count": 0}

    def flaky(src, dst):
        attempts["count"] += 1
        if attempts["count"] == 1:
            error = PermissionError(13, "sharing violation")
            error.winerror = 32
            raise error
        return real_replace(src, dst)

    monkeypatch.setattr(atomic_write.os, "replace", flaky)
    monkeypatch.setattr(atomic_write.time, "sleep", lambda _seconds: None)

    atomic_write.atomic_replace(source, target)

    assert target.read_text(encoding="utf-8") == "payload"
    assert not source.exists()


def test_winerror_33_lock_violation_is_treated_as_transient():
    error = PermissionError(13, "lock violation")
    error.winerror = 33
    assert atomic_write._is_transient(error) is True

    unrelated = OSError(2, "missing")
    assert atomic_write._is_transient(unrelated) is False

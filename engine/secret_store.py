"""Windows DPAPI-backed secret storage for API keys.

Secrets live encrypted in the user data root (secrets.enc), protected with
CryptProtectData - tied to the current Windows user, so a per-user install
is a hard requirement for the desktop app.  Secrets never touch the
install directory, plain-text .env or logs.

On non-Windows platforms the store degrades safely: loading returns None
and saving raises NotImplementedError.
"""

from __future__ import annotations

import base64
import ctypes
import hashlib
import json
import os
import re
import threading
from pathlib import Path
from typing import Any, Dict, Optional
from ctypes import wintypes

from engine import paths
from engine.atomic_write import write_text_atomic

_store_lock = threading.RLock()


class _DATA_BLOB(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_char)),
    ]


def _is_windows() -> bool:
    return os.name == "nt" and hasattr(ctypes, "windll")


def _blob_from_bytes(data: bytes) -> _DATA_BLOB:
    buffer = ctypes.create_string_buffer(data, len(data))
    return _DATA_BLOB(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))


def _bytes_from_blob(blob: _DATA_BLOB) -> bytes:
    try:
        return ctypes.string_at(blob.pbData, blob.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(blob.pbData)


def dpapi_protect(data: bytes) -> bytes:
    if not _is_windows():
        raise NotImplementedError("DPAPI 仅适用于 Windows")
    blob_in = _blob_from_bytes(data)
    blob_out = _DATA_BLOB()
    ok = ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(blob_in), "ai-trading-automation", None, None, None, 0, ctypes.byref(blob_out),
    )
    if not ok:
        raise OSError("CryptProtectData 失败")
    return _bytes_from_blob(blob_out)


def dpapi_unprotect(data: bytes) -> bytes:
    if not _is_windows():
        raise NotImplementedError("DPAPI 仅适用于 Windows")
    blob_in = _blob_from_bytes(data)
    blob_out = _DATA_BLOB()
    ok = ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out),
    )
    if not ok:
        raise OSError("CryptUnprotectData 失败")
    return _bytes_from_blob(blob_out)


def store_path() -> Path:
    return paths.data_root() / "secrets.enc"


def _read_store() -> Dict[str, Any]:
    path = store_path()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _write_store(payload: Dict[str, Any]) -> None:
    path = store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # The credential store is rewritten while the UI may be reading it.
    write_text_atomic(path, json.dumps(payload, ensure_ascii=False, indent=2))


def save_secret(key: str, value: str) -> None:
    """Encrypt and persist one secret under a key (e.g. DEEPSEEK_API_KEY)."""
    name = str(key or "").strip()
    if not name:
        raise ValueError("key 不能为空")
    with _store_lock:
        payload = _read_store()
        if str(value or "").strip():
            payload[name] = base64.b64encode(dpapi_protect(value.encode("utf-8"))).decode("ascii")
        else:
            payload.pop(name, None)
        _write_store(payload)


def load_secret(key: str) -> Optional[str]:
    """Decrypt one stored secret, or None when absent/undecryptable."""
    name = str(key or "").strip()
    if not name or not _is_windows():
        return None
    with _store_lock:
        payload = _read_store()
        encoded = payload.get(name)
    if not encoded:
        return None
    try:
        return dpapi_unprotect(base64.b64decode(encoded)).decode("utf-8")
    except Exception:
        return None


def list_keys() -> list[str]:
    with _store_lock:
        return sorted(key for key in _read_store() if not key.startswith(_RECORD_PREFIX))


def delete_secret(key: str) -> None:
    with _store_lock:
        payload = _read_store()
        payload.pop(str(key or "").strip(), None)
        _write_store(payload)


_RECORD_PREFIX = "dsh-record:"
_RECORD_KEY_RE = re.compile(r"^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$")


def _record_name(key: str) -> str:
    if not _RECORD_KEY_RE.fullmatch(str(key)):
        raise ValueError("invalid credential record key")
    return _RECORD_PREFIX + key


def _record_revision(encoded: Any) -> str:
    return hashlib.sha256(str(encoded or "").encode("utf-8")).hexdigest()


def read_credential_record(key: str) -> Dict[str, Any]:
    """Read an encrypted DSH record and its opaque compare-and-set revision."""
    name = _record_name(key)
    with _store_lock:
        encoded = _read_store().get(name)
        record = None
        if encoded:
            record = json.loads(dpapi_unprotect(base64.b64decode(encoded)).decode("utf-8"))
        return {"record": record, "revision": _record_revision(encoded)}


def write_credential_record(key: str, record: Any, expected_revision: str) -> bool:
    """CAS serializes Web/headless record updates through the single engine.

    A conflicting revision never overwrites a concurrently refreshed grant.
    References and structured records occupy separate encrypted namespaces.
    """
    name = _record_name(key)
    if record is not None:
        if not isinstance(record, dict) or record.get("kind") not in {"api-key", "grant"}:
            raise ValueError("invalid credential record")
        if record["kind"] == "api-key":
            if "key" in record and (not isinstance(record["key"], str) or not record["key"]):
                raise ValueError("invalid API key record")
            if "env" in record and (not isinstance(record["env"], dict) or any(
                not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", str(k)) or not isinstance(v, str)
                for k, v in record["env"].items()
            )):
                raise ValueError("invalid credential environment")
        elif "payload" not in record:
            raise ValueError("grant record requires payload")
        serialized = json.dumps(record, ensure_ascii=False, allow_nan=False)
        if len(serialized.encode("utf-8")) > 256_000:
            raise ValueError("credential record too large")
    with _store_lock:
        store = _read_store()
        if _record_revision(store.get(name)) != expected_revision:
            return False
        if record is None:
            store.pop(name, None)
        else:
            store[name] = base64.b64encode(dpapi_protect(serialized.encode("utf-8"))).decode("ascii")
        _write_store(store)
        return True


def list_credential_records() -> list[Dict[str, str]]:
    """List addresses and kinds only; values never enter configuration forms."""
    with _store_lock:
        keys = [key[len(_RECORD_PREFIX):] for key in _read_store() if key.startswith(_RECORD_PREFIX)]
        return [{"key": key, "kind": read_credential_record(key)["record"]["kind"]} for key in sorted(keys)]


_KEY_SHAPE_RE = re.compile(r"(?<![A-Za-z0-9])(?:sk|key)-[A-Za-z0-9_-]{12,}", re.I)
_LABELLED_SECRET_RE = re.compile(
    r"(?i)((?:api[_ -]?key|token|secret|password|passwd)\s*[:=：]?\s*)([^\s,;，；]{12,})"
)


def redact_text(value: Any) -> str:
    """Remove configured and key-shaped secrets from user-visible text."""
    text = str(value or "")
    names = set(list_keys())
    try:
        from engine.config import cfg

        names.update(
            str(item.get("api_key_env", "")).strip()
            for item in cfg.raw.get("llm", {}).get("models", {}).values()
            if str(item.get("api_key_env", "")).strip()
        )
    except Exception:
        pass
    for name in names:
        secret = os.getenv(name, "") or load_secret(name) or ""
        if len(secret) >= 8:
            text = text.replace(secret, "********")
    # Structured grants may contain tokens that have no recognizable prefix.
    # Redact every scalar string from their encrypted payload, including env.
    def redact_record(item: Any) -> None:
        nonlocal text
        if isinstance(item, dict):
            for nested in item.values():
                redact_record(nested)
        elif isinstance(item, list):
            for nested in item:
                redact_record(nested)
        elif isinstance(item, str) and len(item) >= 8:
            text = text.replace(item, "********")
    for record in list_credential_records():
        redact_record(read_credential_record(record["key"])["record"])
    text = _KEY_SHAPE_RE.sub("********", text)
    return _LABELLED_SECRET_RE.sub(lambda match: match.group(1) + "********", text)


def redact_mapping(value: Any) -> Any:
    """Recursively redact tool arguments without changing their structure."""
    if isinstance(value, dict):
        result: Dict[str, Any] = {}
        for key, item in value.items():
            if any(marker in str(key).upper() for marker in ("KEY", "TOKEN", "SECRET", "PASSWORD", "PASSWD")):
                result[str(key)] = "********" if item else item
            else:
                result[str(key)] = redact_mapping(item)
        return result
    if isinstance(value, list):
        return [redact_mapping(item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_mapping(item) for item in value)
    return redact_text(value) if isinstance(value, str) else value

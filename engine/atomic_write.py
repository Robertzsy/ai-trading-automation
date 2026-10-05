"""Cross-platform atomic file replacement.

Every durable write in this engine follows the same shape: write a sibling
``*.tmp`` file, then replace the target with it. That gives torn-write safety,
but the final step is not reliably atomic on Windows.

``os.replace`` maps to ``MoveFileEx(MOVEFILE_REPLACE_EXISTING)``. When any other
handle has the destination open *without* sharing delete access, the call fails
with ``PermissionError`` (``WinError 5``, "拒绝访问" / access denied). On this
platform that is a routine, transient condition rather than a bug in the caller:
the search indexer, a virus scanner, a backup agent, or simply another thread in
this process reading the very file we are rewriting can hold it for a few
milliseconds.

Observed in the field as an intermittent failure of
``tests/test_analysis_runs.py::test_execution_ready_persists_decisions_and_fingerprint``
(about one run in three under the full suite) and, historically, as
``worker.json.tmp -> worker.json`` failing during a command-bus heartbeat.

The fix is a short bounded retry, which is the standard remedy for a transient
sharing violation. It is deliberately centralised here instead of wrapping
``try/except`` around each call site: this engine has ~20 such sites, and a
per-site patch would drift.
"""
from __future__ import annotations

import errno
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Union

# WinError 5 (access denied) and ERROR_SHARING_VIOLATION (32) are the two forms a
# sharing violation takes here; 33 (lock violation) shows up under file locks.
_WINDOWS_TRANSIENT = {5, 32, 33}

# Total worst-case wait is ~1.27s across 8 attempts: long enough to outlast a
# scanner's hold, short enough that a genuinely undeletable target still fails
# fast and surfaces the real error.
_ATTEMPTS = 8
_BASE_DELAY_SECONDS = 0.01


def _is_transient(error: OSError) -> bool:
    if error.errno in {errno.EACCES, errno.EPERM, errno.EBUSY}:
        return True
    return getattr(error, "winerror", None) in _WINDOWS_TRANSIENT


def atomic_replace(source: Union[str, Path], target: Union[str, Path]) -> None:
    """Replace ``target`` with ``source``, retrying transient sharing violations.

    Raises the original ``OSError`` once the attempts are exhausted, so a real
    permission problem (a read-only target, an ACL denial) is still reported
    rather than silently swallowed.
    """
    source_path = Path(source)
    target_path = Path(target)
    delay = _BASE_DELAY_SECONDS
    last_error: OSError | None = None
    for attempt in range(_ATTEMPTS):
        try:
            os.replace(source_path, target_path)
            return
        except OSError as error:
            if not _is_transient(error):
                raise
            last_error = error
            if attempt == _ATTEMPTS - 1:
                break
            time.sleep(delay)
            delay = min(delay * 2, 0.4)
    assert last_error is not None  # only reachable after a transient failure
    raise last_error


def write_text_atomic(target: Union[str, Path], text: str, *, encoding: str = "utf-8") -> None:
    """Write ``text`` to ``target`` so readers never observe a partial file.

    Prefer this to a hand-rolled temp+replace: the temp name must be unique per
    writer. A fixed sibling such as ``value.json.tmp`` collides when two threads
    of this process write the same target concurrently -- one of them renames
    the file out from under the other, or reads a partially written buffer.
    Including pid/thread/uuid removes that class of bug entirely, at the cost of
    one extra import.

    The temp file is created in the target's own directory so the replacement
    stays on one volume (``os.replace`` is only atomic within a filesystem).
    """
    target_path = Path(target)
    temporary = target_path.with_name(
        f".{target_path.name}.{os.getpid()}.{threading.get_ident()}.{uuid.uuid4().hex}.tmp"
    )
    try:
        temporary.write_text(text, encoding=encoding)
        atomic_replace(temporary, target_path)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass

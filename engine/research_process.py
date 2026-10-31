"""Run a research process with cancellation of its owned child tree."""
from __future__ import annotations

import os
import signal
import subprocess
import time

from engine.subprocess_utils import hidden_subprocess_kwargs


def _stop_tree(process):
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       capture_output=True, timeout=15, **hidden_subprocess_kwargs())
    else:
        os.killpg(process.pid, signal.SIGKILL)
    if process.poll() is None:
        process.kill()


def run_headless(command, *, cycle_id, timeout, env, capture_output=True, **kwargs):
    from engine import analysis_runs
    from engine.trading.control import load_state

    def stopped():
        if load_state().get("kill_switch"):
            if analysis_runs.get(cycle_id):
                analysis_runs.cancel(cycle_id, reason="紧急停止 / Emergency stop")
            return True
        return analysis_runs.is_cancelled(cycle_id)

    if stopped():
        raise InterruptedError("Research cancelled before launch")
    if os.name != "nt":
        kwargs["start_new_session"] = True
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, **kwargs)
    deadline = time.monotonic() + timeout
    try:
        while True:
            if stopped():
                raise InterruptedError("Research process tree cancelled")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(command, timeout)
            try:
                out, err = process.communicate(timeout=min(1, remaining))
                return subprocess.CompletedProcess(command, process.returncode, out, err)
            except subprocess.TimeoutExpired:
                continue
    finally:
        if process.poll() is None:
            _stop_tree(process)
        process.communicate(timeout=15)

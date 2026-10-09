"""Exercise the release version writer in an isolated checkout."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
POWERSHELL = shutil.which("pwsh") or shutil.which("powershell")


@pytest.mark.skipif(POWERSHELL is None, reason="PowerShell is required for release version checks")
def test_lockfile_root_versions_are_checked_without_rewriting_dependencies(tmp_path: Path):
    script = ROOT / "scripts" / "bump-version.ps1"
    paths = set(re.findall(r'Path\s*=\s*"([^"]+)"', script.read_text(encoding="utf-8-sig")))
    paths.update(("scripts/bump-version.ps1", "app/package-lock.json"))
    for relative in paths:
        destination = tmp_path / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, destination)

    lock_path = tmp_path / "app" / "package-lock.json"
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    lock["version"] = lock["packages"][""]["version"] = "0.0.0"
    lock_path.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
    dependencies = {key: value for key, value in lock["packages"].items() if key}

    def run(*args: str):
        return subprocess.run(
            [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
             str(tmp_path / "scripts" / "bump-version.ps1"), *args],
            cwd=tmp_path, capture_output=True, text=True, encoding="utf-8", timeout=45,
        )

    drift = run("-Check")
    assert drift.returncode == 1
    assert "app/package-lock.json" in drift.stdout
    updated = run("-Version", "9.8.7")
    assert updated.returncode == 0, updated.stdout + updated.stderr
    result = json.loads(lock_path.read_text(encoding="utf-8"))
    assert result["version"] == result["packages"][""]["version"] == "9.8.7"
    assert {key: value for key, value in result["packages"].items() if key} == dependencies
    assert run("-Check").returncode == 0

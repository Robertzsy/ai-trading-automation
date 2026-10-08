"""Engine tests for the DSH headless bridge runner (P3)."""
from __future__ import annotations

import json
import subprocess
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from engine import dsh_bridge

NOW = datetime(2026, 8, 12, 10, 0, tzinfo=ZoneInfo("Asia/Shanghai"))


@pytest.fixture(autouse=True)
def isolate(monkeypatch, tmp_path):
    """Sandbox audit output and every DSH home this machine could offer.

    ``_resolve_dsh_home`` falls back to the *installed* data root
    (``%LOCALAPPDATA%\\InvestmentAuto``). Without redirecting LOCALAPPDATA, a
    test on a machine that has the product installed resolves to that real home
    and then seeds profiles into it -- an 8s drift plus a write into live user
    data. Both are unacceptable from a unit test, so both markers are pointed at
    throwaway directories here.

    Note: explicit product configuration outranks DSH_HOME, so a test that needs
    a specific home must call ``_pin_home``. Config itself is deliberately left
    untouched so tests of the real configuration still work.
    """
    monkeypatch.setattr(dsh_bridge, "AUDIT_DIR", tmp_path / "audit")
    (tmp_path / "audit").mkdir()
    monkeypatch.setenv("DSH_HOME", str(tmp_path / "home"))
    # No settings.yaml in these sandboxes, so neither can be mistaken for ours,
    # and neither is the real install.
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "localappdata"))
    monkeypatch.delenv("IA_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("INVESTMENT_AUTO_DATA_DIR", raising=False)
    return tmp_path


def _pin_home(monkeypatch, home):
    """Pin the bridge's configured DSH home for one test (highest precedence)."""
    monkeypatch.setattr(
        dsh_bridge,
        "_bridge_config",
        lambda: {"enabled": True, "dsh_home": str(home)},
    )
    return home


def _runner(tmp_path):
    return dsh_bridge.DshBridgeRunner(app_dir=tmp_path / "app")


def _context(**overrides):
    context = {
        "label": "auto-101500",
        "time_str": "10:15",
        "scheduled_at": NOW,
        "catch_up": False,
        "now": NOW,
        "macro_excerpt": "",
        "account": {},
        "progress_callback": None,
    }
    context.update(overrides)
    return context


def test_runner_spawns_headless_profile_with_task(monkeypatch, tmp_path):
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib").mkdir(parents=True)
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js").write_text("", encoding="utf-8")
    captured = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["timeout"] = kwargs.get("timeout")
        captured["env"] = kwargs.get("env") or {}
        return subprocess.CompletedProcess(command, 0, stdout="轮次总结".encode("utf-8"), stderr=b"")

    monkeypatch.setattr(dsh_bridge.subprocess, "run", fake_run)
    monkeypatch.setattr(dsh_bridge, "_latest_audit_since", lambda *args: None)
    monkeypatch.setattr(dsh_bridge.shutil, "which", lambda name: "node.exe")

    result = _runner(tmp_path)("cn", "intraday", _context())

    assert captured["command"][0] == "node.exe"
    assert "--profile" in captured["command"]
    assert captured["command"][captured["command"].index("--profile") + 1] == "investment"
    task = captured["command"][-1]
    assert "CN" in task and "盘中轮次" in task and "auto-101500" in task
    assert "investment_submit_decisions" in task
    assert captured["env"].get("DSH_TELEMETRY_DISABLED") == "1"
    assert captured["env"].get("DSH_PERMISSION_MODE") == "danger-full-access"
    assert captured["env"].get("IA_AUTONOMOUS_ROUND") == "1"
    assert captured["env"].get("INVESTMENT_CYCLE_ID") == "20260812T1000-cn-auto-101500"
    assert "investment_analysis_workflow" in task
    assert result["status"] == "generated"
    assert result["report_text"] == "轮次总结"
    assert result["elapsed_seconds"] >= 0
    assert result["execution"] == {"fills": [], "rejected": []}
    assert result["warnings"]


def test_runner_passes_engine_url_from_api_port(monkeypatch, tmp_path):
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib").mkdir(parents=True)
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js").write_text("", encoding="utf-8")
    captured = {}

    def fake_run(command, **kwargs):
        captured["env"] = kwargs.get("env") or {}
        return subprocess.CompletedProcess(command, 0, stdout=b"ok", stderr=b"")

    monkeypatch.setattr(dsh_bridge.subprocess, "run", fake_run)
    monkeypatch.setattr(dsh_bridge.shutil, "which", lambda name: "node.exe")
    monkeypatch.setenv("INVESTMENT_API_PORT", "8802")
    monkeypatch.delenv("INVESTMENT_ENGINE_URL", raising=False)

    _runner(tmp_path)("cn", "intraday", _context())

    assert captured["env"].get("INVESTMENT_ENGINE_URL") == "http://127.0.0.1:8802"


def test_desktop_runner_applies_dpapi_patch_with_or_without_token(monkeypatch, tmp_path):
    """The patch must be applied with or without a desktop token.

    This test previously asserted the opposite -- that a missing
    ``IA_ACCESS_TOKEN`` yields a command with no ``--patch`` -- which is how the
    desktop defect reached users: without the patch the default
    ``.credentials.yaml`` row stays enabled and the DPAPI row is never inserted,
    so the round has no credentials service at all and dies rc=1 with
    ``MISSING_CREDENTIAL ... deepseek-official``. The token decides whether the
    engine checks it, never whether the provider is installed.
    """
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib").mkdir(parents=True)
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js").write_text("", encoding="utf-8")
    patch_dir = tmp_path / "app" / "profiles" / "patches"
    patch_dir.mkdir(parents=True)
    (patch_dir / "dpapi-credentials.yml").write_text(
        "- id: credentials\n  disabled: true\n\n- insert:\n    - id: credentials-dpapi\n"
        "      name: '@investment-auto/dsh-dpapi-credentials'\n      config:\n"
        "        engineUrl: 'http://127.0.0.1:8790'\n",
        encoding="utf-8",
    )
    captured = {"with_token": None, "without_token": None}
    monkeypatch.setenv("INVESTMENT_AUTO_DATA_DIR", str(tmp_path / "desktop-data"))

    def fake_run(command, **kwargs):
        key = "with_token" if "desktop-token" == captured["_token"] else "without_token"
        captured[key] = list(command)
        return subprocess.CompletedProcess(command, 0, stdout=b"ok", stderr=b"")

    monkeypatch.setattr(dsh_bridge.subprocess, "run", fake_run)
    monkeypatch.setattr(dsh_bridge.shutil, "which", lambda name: "node.exe")

    captured["_token"] = "desktop-token"
    monkeypatch.setenv("IA_ACCESS_TOKEN", "desktop-token")
    monkeypatch.setenv("INVESTMENT_API_PORT", "2028")
    monkeypatch.delenv("INVESTMENT_ENGINE_URL", raising=False)
    _runner(tmp_path)("cn", "intraday", _context())

    captured["_token"] = ""
    monkeypatch.delenv("IA_ACCESS_TOKEN", raising=False)
    _runner(tmp_path)("cn", "intraday", _context())

    # Both rounds carry a patch, and it is the round-local copy rather than the
    # shipped file, so the engine URL and token travel with it.
    for key in ("with_token", "without_token"):
        command = captured[key]
        assert command is not None, f"{key}: no subprocess run captured"
        assert "--patch" in command, f"{key}: patch was not applied"
        applied = Path(command[command.index("--patch") + 1])
        assert applied.name == dsh_bridge._SESSION_PATCH_NAME, f"{key}: applied {applied}"

    session_patch = tmp_path / "app" / "runtime" / "dsh-patches" / dsh_bridge._SESSION_PATCH_NAME
    text = session_patch.read_text(encoding="utf-8")
    # Written last, so it reflects the tokenless round: empty, not omitted.
    assert "engineUrl: 'http://127.0.0.1:2028'" in text
    assert "token: ''" in text
    # The shipped fallback URL must not survive into the session copy.
    assert "8790" not in text


def _app_with_credentials_patch(tmp_path):
    app = tmp_path / "app"
    binary = app / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js"
    binary.parent.mkdir(parents=True)
    binary.write_text("", encoding="utf-8")
    patch_file = app / "profiles" / "patches" / "dpapi-credentials.yml"
    patch_file.parent.mkdir(parents=True)
    patch_file.write_text(
        "- id: credentials\n  disabled: true\n- insert:\n    - id: credentials-dpapi\n"
        "      name: '@investment-auto/dsh-dpapi-credentials'\n      config:\n"
        "        engineUrl: 'http://127.0.0.1:8790'\n", encoding="utf-8",
    )
    return app


def test_source_development_uses_the_settings_pages_file_credentials(monkeypatch, tmp_path):
    app = _app_with_credentials_patch(tmp_path)
    main_home = app / "dev-home"
    main_home.mkdir()
    credentials = main_home / ".credentials.yaml"
    credentials.write_text("DEEPSEEK_API_KEY: sk-test\n", encoding="utf-8")
    _pin_home(monkeypatch, main_home)
    captured = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["home"] = kwargs["env"]["DSH_HOME"]
        return subprocess.CompletedProcess(command, 0, stdout=b"ok", stderr=b"")

    monkeypatch.setattr(dsh_bridge.subprocess, "run", fake_run)
    _runner(tmp_path).run_analysis_round("us", symbols=["AAPL"], symbols_source="user", label="dev", submit=False, cycle_id="dev-test")
    assert "--patch" not in captured["command"]
    assert (Path(captured["home"]) / ".credentials.yaml").read_bytes() == credentials.read_bytes()


@pytest.mark.parametrize("marker", ["data_directory", "installed_home"])
def test_tokenless_desktop_keeps_dpapi_even_with_leftover_file_credentials(monkeypatch, tmp_path, marker):
    _app_with_credentials_patch(tmp_path)
    main_home = tmp_path / "desktop-data" if marker == "data_directory" else tmp_path / "localappdata" / "InvestmentAuto"
    main_home.mkdir(parents=True)
    (main_home / ".credentials.yaml").write_text("DEEPSEEK_API_KEY: stale-test-value\n", encoding="utf-8")
    if marker == "data_directory":
        monkeypatch.setenv("INVESTMENT_AUTO_DATA_DIR", str(main_home))
    _pin_home(monkeypatch, main_home)
    captured = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["home"] = kwargs["env"]["DSH_HOME"]
        return subprocess.CompletedProcess(command, 0, stdout=b"ok", stderr=b"")

    monkeypatch.setattr(dsh_bridge.subprocess, "run", fake_run)
    _runner(tmp_path).run_analysis_round("us", symbols=["AAPL"], symbols_source="user", label="desktop", submit=False, cycle_id="desktop-test")
    assert "--patch" in captured["command"]
    assert not (Path(captured["home"]) / ".credentials.yaml").exists()


def test_session_patch_prefers_explicit_engine_url(monkeypatch, tmp_path):
    patch_dir = tmp_path / "patches"
    patch_dir.mkdir()
    base = patch_dir / "dpapi-credentials.yml"
    base.write_text("      config:\n        engineUrl: 'http://127.0.0.1:8790'\n", encoding="utf-8")
    monkeypatch.setenv("INVESTMENT_ENGINE_URL", "http://127.0.0.1:9999")
    monkeypatch.setenv("INVESTMENT_API_PORT", "1111")
    monkeypatch.setenv("IA_ACCESS_TOKEN", "tok")

    written = dsh_bridge._write_session_patch(base, tmp_path / "out")
    text = written.read_text(encoding="utf-8")
    assert "engineUrl: 'http://127.0.0.1:9999'" in text
    assert "token: 'tok'" in text
    assert written.parent == tmp_path / "out"


def test_runner_folds_engine_audit_into_result(monkeypatch, tmp_path):
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib").mkdir(parents=True)
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js").write_text("", encoding="utf-8")
    audit_payload = {
        "command": "submit_decisions",
        "market": "cn",
        "label": "auto-101500",
        "decisions": [{"symbol": "600519", "action": "BUY", "confidence": 0.8}],
        "execution": {"fills": [{"code": "600519", "shares": 100}]},
        "risk": {"orders": []},
        "mandate": {"profile": "neutral"},
    }
    audit_path = tmp_path / "audit" / "20260812-100001-cn-auto-101500.json"
    audit_path.write_text(json.dumps(audit_payload, ensure_ascii=False), encoding="utf-8")
    # Deterministically "written during the run": the runner filters audits by
    # mtime >= call start.
    import os
    import time

    os.utime(audit_path, (time.time() + 5, time.time() + 5))

    def fake_run(command, **kwargs):
        return subprocess.CompletedProcess(command, 0, stdout="ok".encode("utf-8"), stderr=b"")

    monkeypatch.setattr(dsh_bridge.subprocess, "run", fake_run)
    monkeypatch.setattr(dsh_bridge.shutil, "which", lambda name: "node.exe")
    result = _runner(tmp_path)("cn", "intraday", _context())

    assert result["decisions"][0]["symbol"] == "600519"
    assert result["execution"]["fills"][0]["code"] == "600519"
    assert result["mandate"]["profile"] == "neutral"
    assert result["audit_file"] == str(audit_path)


def test_runner_reports_process_failure(monkeypatch, tmp_path):
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib").mkdir(parents=True)
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js").write_text("", encoding="utf-8")

    def fake_run(command, **kwargs):
        return subprocess.CompletedProcess(command, 1, stdout=b"", stderr="fatal error".encode("utf-8"))

    monkeypatch.setattr(dsh_bridge.subprocess, "run", fake_run)
    monkeypatch.setattr(dsh_bridge.shutil, "which", lambda name: "node.exe")
    result = _runner(tmp_path)("cn", "intraday", _context())

    assert result["status"] == "error"
    assert "rc=1" in result["error"]
    assert "fatal error" in result["stderr_tail"]


def test_runner_reports_timeout(monkeypatch, tmp_path):
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib").mkdir(parents=True)
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js").write_text("", encoding="utf-8")

    def fake_run(command, **kwargs):
        raise subprocess.TimeoutExpired(command, 30)

    monkeypatch.setattr(dsh_bridge.subprocess, "run", fake_run)
    monkeypatch.setattr(dsh_bridge.shutil, "which", lambda name: "node.exe")
    result = _runner(tmp_path)("us", "close", _context())

    assert result["status"] == "error"
    assert "超时" in result["error"]


def test_round_task_covers_close_rounds(monkeypatch, tmp_path):
    task = dsh_bridge._round_task("us", "close", _context())
    assert "US" in task and "收盘复盘轮次" in task


def test_analysis_task_names_symbols_and_forbids_rescreening(monkeypatch, tmp_path):
    task = dsh_bridge._analysis_task(
        "cn",
        ["688981", "600519"],
        symbols_source="user",
        label="user-analysis",
        submit=False,
        cycle_id="20260822-cn-user-0000001",
    )
    assert "CN" in task and "20260822-cn-user-0000001" in task
    # Strict JSON array: the model must never repair a hand-built literal.
    assert 'symbols=["688981", "600519"]' in task
    assert 'symbols=["688981"' not in task.replace('symbols=["688981", "600519"]', "")
    assert 'symbols_source="user"' in task and "submit=false" in task
    assert "investment_analysis_workflow" in task
    assert "不得" in task and "选股" in task


def test_analysis_task_single_symbol_is_quoted_json():
    task = dsh_bridge._analysis_task("us", ["AAPL"], symbols_source="user", label="x", submit=False, cycle_id="c1")
    assert 'symbols=["AAPL"]' in task


def test_analysis_task_without_symbols_uses_internal_screening(monkeypatch, tmp_path):
    task = dsh_bridge._analysis_task(
        "hk",
        [],
        symbols_source="autonomous",
        label="auto",
        submit=True,
        cycle_id="20260822-hk-auto",
    )
    assert 'symbols_source="autonomous"' in task and "submit=true" in task
    assert "symbols=[" not in task
    assert "内部执行选股" in task


def test_runner_spawns_analysis_round_with_same_env(monkeypatch, tmp_path):
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib").mkdir(parents=True)
    (tmp_path / "app" / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js").write_text("", encoding="utf-8")
    # Isolate the main home so the sync runs against test data only.
    main_home = tmp_path / "main-home"
    (main_home / "storages").mkdir(parents=True)
    (main_home / "storages" / "settings.json").write_text("{}", encoding="utf-8")
    (main_home / "storages" / "workspace.json").write_text("{}", encoding="utf-8")
    (main_home / ".credentials.yaml").write_text("DEEPSEEK_API_KEY: sk-test\n", encoding="utf-8")
    monkeypatch.setenv("DSH_HOME", str(main_home))
    # Configuration outranks DSH_HOME, so pin it to the same home under test.
    _pin_home(monkeypatch, main_home)
    monkeypatch.delenv("IA_ACCESS_TOKEN", raising=False)
    captured = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["env"] = kwargs.get("env") or {}
        return subprocess.CompletedProcess(command, 0, stdout="分析总结".encode("utf-8"), stderr=b"")

    monkeypatch.setattr(dsh_bridge.subprocess, "run", fake_run)
    monkeypatch.setattr(dsh_bridge.shutil, "which", lambda name: "node.exe")

    result = _runner(tmp_path).run_analysis_round(
        "cn",
        symbols=["688981"],
        symbols_source="user",
        label="user-analysis",
        submit=False,
        cycle_id="20260822-cn-user-0000001",
    )

    assert captured["command"][0] == "node.exe"
    assert captured["command"][captured["command"].index("--profile") + 1] == "investment"
    assert captured["env"].get("IA_AUTONOMOUS_ROUND") == "1"
    assert captured["env"].get("INVESTMENT_CYCLE_ID") == "20260822-cn-user-0000001"
    # Background rounds run in the INTERNAL home, not the user's home.
    internal = main_home / "agent-home"
    assert captured["env"].get("DSH_HOME") == str(internal)
    assert result["status"] == "generated"
    assert result["report_text"] == "分析总结"
    # Settings are inherited, session-plane files are NOT, dev credentials are.
    assert (internal / "storages" / "settings.json").exists()
    assert not (internal / "storages" / "workspace.json").exists()
    assert (internal / ".credentials.yaml").exists()


def test_resolve_app_dir_finds_repo_app():
    resolved = dsh_bridge._resolve_app_dir()
    assert resolved is not None
    assert (resolved / "node_modules" / "@deepseek-ai" / "dsh").exists()


def test_install_dsh_runner_registers_when_enabled(monkeypatch):
    captured = {}

    def fake_set_runner(runner):
        captured["runner"] = runner

    monkeypatch.setattr("engine.scheduler.set_cycle_runner", fake_set_runner)
    monkeypatch.setenv("INVESTMENT_AUTO_APP_DIR", "")
    installed = dsh_bridge.install_dsh_runner()
    assert installed is True
    assert captured["runner"] is not None


def test_install_dsh_runner_skips_when_disabled(monkeypatch):
    monkeypatch.setitem(dsh_bridge.cfg.raw.setdefault("autonomous", {}), "dsh_bridge", {"enabled": False})
    installed = dsh_bridge.install_dsh_runner()
    assert installed is False

def test_configured_home_outranks_inherited_dsh_home(monkeypatch, tmp_path):
    """A foreign DSH_HOME must never decide where Investment Auto's rounds run.

    On a machine that also runs DSH for other projects, DSH_HOME is inherited
    from the launching shell and points at THAT installation's home. Honouring
    it couples our rounds to a foreign home: they write profiles/storages into
    it, and they inherit its .credentials.yaml -- which another DSH version may
    have written in a format this build rejects, failing every round at boot.
    Observed in the field, not hypothetical.
    """
    product_home = tmp_path / "product-home"
    foreign_home = tmp_path / "foreign-dsh-home"
    product_home.mkdir()
    foreign_home.mkdir()
    _pin_home(monkeypatch, product_home)
    monkeypatch.setenv("DSH_HOME", str(foreign_home))

    resolved = dsh_bridge._resolve_dsh_home(tmp_path / "app")

    assert resolved == str(product_home)
    assert "foreign" not in resolved


def test_relative_configured_home_resolves_against_app_root(monkeypatch, tmp_path):
    """A relative dsh_home must not depend on the engine's working directory."""
    monkeypatch.setattr(dsh_bridge, "_bridge_config", lambda: {"dsh_home": "app/dev-home"})
    resolved = dsh_bridge._resolve_dsh_home(tmp_path / "app")
    assert Path(resolved).is_absolute()
    assert resolved == str(dsh_bridge.APP_ROOT / "app" / "dev-home")


def test_dsh_home_falls_back_to_env_when_it_is_ours(monkeypatch, tmp_path):
    """A DSH_HOME pointing at OUR data root is honoured (packaged shell path).

    This is how the desktop shell drives the engine: it exports DSH_HOME to the
    installed data root, and that root carries the model/provider selection and
    the DPAPI credential store the rounds must inherit.
    """
    our_home = tmp_path / "our-data-home"
    our_home.mkdir()
    (our_home / "settings.yaml").write_text("ui-onboarding: {}\n", encoding="utf-8")
    monkeypatch.setattr(dsh_bridge, "_bridge_config", lambda: {})
    monkeypatch.setenv("DSH_HOME", str(our_home))
    assert dsh_bridge._resolve_dsh_home(tmp_path / "app") == str(our_home)


def test_foreign_dsh_home_is_rejected_even_when_unconfigured(monkeypatch, tmp_path):
    """A DSH_HOME belonging to ANOTHER project must never be adopted.

    Such a home has profiles/agent-home/sessions but no settings.yaml. Adopting
    it makes rounds write into a foreign tree and inherit its .credentials.yaml,
    which another DSH version may have written in a format this build rejects.
    """
    foreign = tmp_path / "foreign-dsh"
    (foreign / "profiles").mkdir(parents=True)
    (foreign / "agent-home").mkdir()
    monkeypatch.setattr(dsh_bridge, "_bridge_config", lambda: {})
    monkeypatch.setenv("DSH_HOME", str(foreign))
    # Isolate the installed-root probe so only the dev home can win.
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "no-such-localappdata"))
    app_dir = tmp_path / "app"
    (app_dir / "dev-home").mkdir(parents=True)
    resolved = dsh_bridge._resolve_dsh_home(app_dir)
    assert resolved == str(app_dir / "dev-home")
    assert Path(resolved) != foreign


def test_installed_data_root_outranks_dev_home(monkeypatch, tmp_path):
    """On an installed machine the packaged data root wins over app/dev-home.

    app/dev-home is a development home: it carries no settings storages and no
    credentials, so preferring it on a real install would leave rounds without a
    configured model. See _sync_internal_home.
    """
    installed = tmp_path / "InvestmentAuto"
    installed.mkdir()
    (installed / "settings.yaml").write_text("ui-onboarding: {}\n", encoding="utf-8")
    monkeypatch.setattr(dsh_bridge, "_bridge_config", lambda: {})
    monkeypatch.delenv("DSH_HOME", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    app_dir = tmp_path / "app"
    (app_dir / "dev-home").mkdir(parents=True)
    assert dsh_bridge._resolve_dsh_home(app_dir) == str(installed)


def test_dev_home_is_used_when_nothing_else_applies(monkeypatch, tmp_path):
    """Source checkout with no env and no install: the in-repo dev home wins."""
    app_dir = tmp_path / "app"
    (app_dir / "dev-home").mkdir(parents=True)
    monkeypatch.setattr(dsh_bridge, "_bridge_config", lambda: {})
    monkeypatch.delenv("DSH_HOME", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "no-such-localappdata"))
    assert dsh_bridge._resolve_dsh_home(app_dir) == str(app_dir / "dev-home")


def test_product_data_home_marker_requires_settings_yaml(tmp_path):
    """The marker is settings.yaml: present on ours, absent on a foreign DSH home."""
    ours = tmp_path / "ours"
    ours.mkdir()
    (ours / "settings.yaml").write_text("{}\n", encoding="utf-8")
    foreign = tmp_path / "foreign"
    (foreign / "profiles").mkdir(parents=True)
    (foreign / "agent-home").mkdir()
    assert dsh_bridge._is_product_data_home(ours) is True
    assert dsh_bridge._is_product_data_home(foreign) is False
    assert dsh_bridge._is_product_data_home(tmp_path / "missing") is False

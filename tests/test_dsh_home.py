"""Engine tests for DSH home seeding (installed-desktop path)."""
from __future__ import annotations

import json
from pathlib import Path

from engine import dsh_home


def _make_app(tmp_path):
    app = tmp_path / "app"
    (app / "profiles" / "investment-web").mkdir(parents=True)
    (app / "profiles" / "investment-web" / "cordis.patch.yml").write_text("- id: system-prompt\n  config:\n    persona: test\n", encoding="utf-8")
    (app / "presets" / "investment").mkdir(parents=True)
    (app / "presets" / "investment" / "preset.yml").write_text("name: 投资助手\n", encoding="utf-8")
    (app / "skills" / "security-analysis").mkdir(parents=True)
    (app / "skills" / "security-analysis" / "SKILL.md").write_text("---\nname: security-analysis\ndescription: test skill\n---\nbody\n", encoding="utf-8")
    plugin = app / "plugins" / "dsh-test-plugin"
    plugin.mkdir(parents=True)
    (plugin / "package.json").write_text(json.dumps({"name": "@ai-trading-automation/dsh-test-plugin"}), encoding="utf-8")
    return app


def test_seed_populates_profiles_presets_skills_and_plugins(tmp_path):
    app = _make_app(tmp_path)
    home = tmp_path / "home"

    dsh_home.seed_dsh_home(app, home)

    assert (home / "profiles" / "investment-web" / "cordis.patch.yml").exists()
    assert (home / ".agent-presets" / "investment" / "preset.yml").exists()
    assert (home / "skills" / "security-analysis" / "SKILL.md").exists()
    plugin_target = home / "profiles" / "investment-web" / "node_modules" / "@ai-trading-automation" / "dsh-test-plugin"
    assert (plugin_target / "package.json").exists()


def test_seed_never_overwrites_user_files_without_force(tmp_path):
    app = _make_app(tmp_path)
    home = tmp_path / "home"
    (home / "profiles" / "investment-web").mkdir(parents=True)
    user_patch = home / "profiles" / "investment-web" / "cordis.patch.yml"
    user_patch.write_text("# user-owned\n", encoding="utf-8")

    dsh_home.seed_dsh_home(app, home)
    assert user_patch.read_text(encoding="utf-8") == "# user-owned\n"

    dsh_home.seed_dsh_home(app, home, force=True)
    assert user_patch.read_text(encoding="utf-8") != "# user-owned\n"


def test_seed_from_env_requires_both_vars(monkeypatch, tmp_path):
    app = _make_app(tmp_path)
    monkeypatch.setenv("AI_TRADING_AUTOMATION_APP_DIR", str(app))
    monkeypatch.delenv("DSH_HOME", raising=False)
    assert dsh_home.seed_from_env() is False

    monkeypatch.setenv("DSH_HOME", str(tmp_path / "home"))
    assert dsh_home.seed_from_env() is True
    assert (tmp_path / "home" / "profiles" / "investment-web").exists()


def test_seed_from_env_refreshes_shipped_files(monkeypatch, tmp_path):
    """Product updates must reach existing installs: shipped profile files
    are refreshed even when an older copy already sits in the home."""
    app = _make_app(tmp_path)
    home = tmp_path / "home"
    (home / "profiles" / "investment-web").mkdir(parents=True)
    stale = home / "profiles" / "investment-web" / "cordis.patch.yml"
    stale.write_text("# stale shipped file\n", encoding="utf-8")

    monkeypatch.setenv("AI_TRADING_AUTOMATION_APP_DIR", str(app))
    monkeypatch.setenv("DSH_HOME", str(home))
    assert dsh_home.seed_from_env() is True
    assert stale.read_text(encoding="utf-8") != "# stale shipped file\n"

    # Extra user-created entries survive the refresh.
    (home / "profiles" / "user-extra").mkdir(parents=True)
    (home / "profiles" / "user-extra" / "keep.txt").write_text("mine", encoding="utf-8")
    dsh_home.seed_from_env()
    assert (home / "profiles" / "user-extra" / "keep.txt").read_text(encoding="utf-8") == "mine"


def test_seed_from_env_ignores_missing_app(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_TRADING_AUTOMATION_APP_DIR", str(tmp_path / "nope"))
    monkeypatch.setenv("DSH_HOME", str(tmp_path / "home"))
    assert dsh_home.seed_from_env() is False


def test_seed_does_not_inspect_unrelated_user_history(monkeypatch, tmp_path):
    app = _make_app(tmp_path)
    home = tmp_path / "home"
    history = home / "runtime" / "archive" / "investment"
    history.mkdir(parents=True)
    (history / "keep.txt").write_text("user data", encoding="utf-8")
    original = Path.is_dir

    def guarded_is_dir(path):
        if path.is_relative_to(home / "runtime"):
            raise PermissionError("User-history traversal is forbidden during product seeding")
        return original(path)

    monkeypatch.setattr(Path, "is_dir", guarded_is_dir)
    result = dsh_home.seed_dsh_home(app, home, force=True)

    assert set(result["seeded"]) == {
        str(Path("profiles/investment-web")),
        str(Path(".agent-presets/investment")),
        str(Path("skills/security-analysis")),
    }
    assert (history / "keep.txt").read_text(encoding="utf-8") == "user data"


def test_product_profile_preserves_settings_on_force_and_backs_up_known_legacy(tmp_path):
    import hashlib
    app = _make_app(tmp_path)
    profile = app / "profiles/investment-web"
    (profile / "product").mkdir()
    (profile / "product/cordis.patch.yml").write_text("# shipped\n", encoding="utf-8")
    (profile / "cordis.patch.yml").write_text("[]\n", encoding="utf-8")
    legacy = "# legacy config\n"
    (profile / "legacy-profile.sha256").write_text(hashlib.sha256(legacy.encode()).hexdigest(), encoding="ascii")
    home = tmp_path / "home"
    dsh_home.seed_dsh_home(app, home, force=True)
    patch = home / "profiles/investment-web/cordis.patch.yml"
    patch.write_text(legacy, encoding="utf-8")
    dsh_home.seed_dsh_home(app, home, force=True)
    assert "preference: zh" in patch.read_text(encoding="utf-8")
    assert patch.with_name("cordis.patch.yml.pre-0.2.1").read_text(encoding="utf-8") == legacy
    settings = "- id: llm\n  config:\n    model: selected-model\n"
    patch.write_text(settings, encoding="utf-8")
    dsh_home.seed_dsh_home(app, home, force=True)
    assert patch.read_text(encoding="utf-8") == settings
    assert (patch.parent / "product/cordis.patch.yml").read_text(encoding="utf-8") == "# shipped\n"


def test_product_manifest_excludes_unreleased_plugins_and_skills(tmp_path):
    app = _make_app(tmp_path)
    (app / "product-manifest.json").write_text('{"plugins":[],"skills":[]}', encoding="utf-8")
    home = tmp_path / "home"
    dsh_home.seed_dsh_home(app, home, force=True)
    assert not (home / "skills/security-analysis").exists()
    assert not (home / "profiles/investment-web/node_modules").exists()


def test_known_older_template_migrates_without_replacing_a_different_backup(tmp_path):
    import hashlib
    app = _make_app(tmp_path)
    profile = app / "profiles/investment-web"
    (profile / "product").mkdir()
    (profile / "cordis.patch.yml").write_text("[]\n", encoding="utf-8")
    older = "# AI Trading Automation 2.0\n- id: investment-tools\n  disabled: true\n"
    digest = hashlib.sha256(older.encode()).hexdigest()
    (profile / "legacy-profile.sha256").write_text("0" * 64 + "\n" + digest + "\n", encoding="ascii")
    patch = tmp_path / "home/profiles/investment-web/cordis.patch.yml"
    patch.parent.mkdir(parents=True)
    patch.write_text(older, encoding="utf-8")
    backup = patch.with_name("cordis.patch.yml.pre-0.2.1")
    backup.write_text("other preserved version", encoding="utf-8")
    dsh_home.seed_dsh_home(app, tmp_path / "home", force=True)
    assert "preference: zh" in patch.read_text(encoding="utf-8")
    assert backup.read_text(encoding="utf-8") == "other preserved version"
    assert patch.with_name("cordis.patch.yml.pre-0.2.1-" + digest).read_text(encoding="utf-8") == older
    dsh_home.seed_dsh_home(app, tmp_path / "home", force=True)
    assert len(list(patch.parent.glob("cordis.patch.yml.pre-*"))) == 2


def test_unknown_legacy_custom_edits_remain_protected(tmp_path):
    import pytest
    app = _make_app(tmp_path)
    profile = app / "profiles/investment-web"
    (profile / "product").mkdir()
    (profile / "legacy-profile.sha256").write_text("0" * 64 + "\n", encoding="ascii")
    patch = tmp_path / "home/profiles/investment-web/cordis.patch.yml"
    patch.parent.mkdir(parents=True)
    custom = b"# AI Trading Automation 2.0\n- id: investment-tools\n  config: {custom: true}\n"
    patch.write_bytes(custom)
    with pytest.raises(ValueError, match="contains custom edits"):
        dsh_home.seed_dsh_home(app, tmp_path / "home", force=True)
    assert patch.read_bytes() == custom


def test_concurrent_startups_do_not_remove_live_unchanged_plugins(tmp_path):
    import subprocess
    import sys
    from concurrent.futures import ThreadPoolExecutor

    app = _make_app(tmp_path)
    plugin = app / "plugins/dsh-test-plugin"
    (plugin / "client.js").write_text("// live product client\n", encoding="utf-8")
    home = tmp_path / "home"
    dsh_home.seed_dsh_home(app, home, force=True)
    target = home / "profiles/investment-web/node_modules/@ai-trading-automation/dsh-test-plugin/client.js"
    before = target.stat().st_mtime_ns
    code = "from engine.dsh_home import seed_dsh_home; import sys; [seed_dsh_home(sys.argv[1], sys.argv[2], force=True) for _ in range(6)]"

    def run_startup():
        return subprocess.run([sys.executable, "-c", code, str(app), str(home)],
                              capture_output=True, text=True, timeout=20)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first, second = pool.submit(run_startup), pool.submit(run_startup)
        while not (first.done() and second.done()):
            assert target.read_text(encoding="utf-8") == "// live product client\n"
        for result in (first.result(), second.result()):
            assert result.returncode == 0, result.stderr
    assert target.stat().st_mtime_ns == before

    # A real shipped update is still installed on the next startup.
    (plugin / "client.js").write_text("// updated product client\n", encoding="utf-8")
    dsh_home.seed_dsh_home(app, home, force=True)
    assert target.read_text(encoding="utf-8") == "// updated product client\n"

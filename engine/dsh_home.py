"""DSH home seeding for the installed desktop product.

The installer ships app/ (profiles, presets, skills, plugins) beside the
engine; on startup the engine seeds them into $DSH_HOME (the user data
root). Pure Python — the installed product never runs PowerShell. Existing
user files are never overwritten unless force=True (mirrors seed.ps1).

Development keeps app/scripts/seed.ps1 for app/dev-home; the same layout
contract applies.
"""
from __future__ import annotations

import json
import hashlib
import logging
import os
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from engine.runtime_lock import ProcessLease

logger = logging.getLogger("ai-trading-automation.dsh-home")


def _same_tree(source: Path, target: Path) -> bool:
    """Avoid removing a live plugin when another startup already refreshed it."""
    if not target.is_dir():
        return False
    source_files = {path.relative_to(source) for path in source.rglob("*") if path.is_file()}
    target_files = {path.relative_to(target) for path in target.rglob("*") if path.is_file()}
    return source_files == target_files and all(
        (source / path).read_bytes() == (target / path).read_bytes() for path in source_files
    )


def _copy_if_changed(source, target):
    source, target = Path(source), Path(target)
    if not target.is_file() or source.read_bytes() != target.read_bytes():
        shutil.copy2(source, target)
    return str(target)


def _seed_profiles(source: Path, target: Path, *, force: bool) -> None:
    """Refresh shipped bundles without overwriting DSH's live settings patch."""
    if not source.is_dir():
        return
    for profile in source.iterdir():
        if not profile.is_dir():
            continue
        destination = target / profile.name
        if not (profile / "product").is_dir():
            _copy_tree(profile, destination, force=force)
            continue
        destination.mkdir(parents=True, exist_ok=True)
        patch = destination / "cordis.patch.yml"
        migration = profile / "legacy-profile.sha256"
        if patch.is_file() and migration.is_file():
            text = patch.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            known_templates = set(migration.read_text(encoding="ascii").split())
            if digest in known_templates:
                backup = patch.with_name("cordis.patch.yml.pre-0.2.1")
                if backup.exists() and backup.read_bytes() != patch.read_bytes():
                    backup = patch.with_name(f"cordis.patch.yml.pre-0.2.1-{digest}")
                if backup.exists() and backup.read_bytes() != patch.read_bytes():
                    raise ValueError(f"Legacy profile backup conflict: {backup}")
                if not backup.exists():
                    shutil.copy2(patch, backup)
                shutil.copy2(profile / "cordis.patch.yml", patch)
                if profile.name == "investment-web":
                    # Existing rc.6 installations defaulted to Chinese. The
                    # upstream legacy-settings import can still restore an
                    # explicit saved preference afterward.
                    patch.write_text("- id: locale\n  config:\n    preference: zh\n", encoding="utf-8")
            elif "# AI Trading Automation 2.0" in text and "id: investment-tools" in text:
                raise ValueError(f"Legacy profile {profile.name} contains custom edits; preserve {patch} and migrate its overrides before upgrading")
        for child in profile.iterdir():
            if child.name == "cordis.patch.yml" and patch.exists():
                continue
            output = destination / child.name
            if child.is_dir():
                _copy_tree(child, output, force=force)
            elif force or not output.exists():
                _copy_if_changed(child, output)


def _copy_tree(source: Path, target: Path, *, force: bool, allowed: Optional[list[str]] = None) -> None:
    if not source.exists():
        return
    target.mkdir(parents=True, exist_ok=True)
    for child in source.iterdir():
        if allowed is not None and child.name not in allowed:
            continue
        destination = target / child.name
        if destination.exists() and not force:
            continue
        if child.is_dir():
            shutil.copytree(child, destination, dirs_exist_ok=True, copy_function=_copy_if_changed)
        else:
            _copy_if_changed(child, destination)


def _install_plugins(plugins_root: Path, profiles_root: Path, *, force: bool, allowed: Optional[list[str]] = None) -> None:
    if not plugins_root.exists():
        return
    for plugin in plugins_root.iterdir():
        if allowed is not None and plugin.name not in allowed:
            continue
        if not plugin.is_dir():
            continue
        manifest_path = plugin / "package.json"
        if not manifest_path.exists():
            continue
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        name = str(manifest.get("name", ""))
        if "/" not in name:
            logger.warning("plugin %s has no scoped package name; skipped", plugin.name)
            continue
        for profile in profiles_root.iterdir():
            if not profile.is_dir() or profile.name == "node_modules":
                continue
            destination = profile / "node_modules" / name
            if destination.exists() and not force:
                continue
            if _same_tree(plugin, destination):
                continue
            if destination.exists():
                shutil.rmtree(destination)
            shutil.copytree(plugin, destination)


def seed_dsh_home(app_dir: str | Path, dsh_home: str | Path, *, force: bool = False) -> Dict[str, Any]:
    """Seed profiles/presets/skills/plugins from app/ into DSH_HOME."""
    # API and scheduler start together. Protect their shared shipped trees;
    # the OS releases this lock even if one startup process exits unexpectedly.
    lease = ProcessLease(Path(dsh_home) / ".product-seed.lock")
    deadline = time.monotonic() + 30
    while True:
        try:
            lease.acquire()
            break
        except RuntimeError:
            if time.monotonic() >= deadline:
                raise TimeoutError("Timed out waiting for DSH product files to finish syncing")
            time.sleep(.05)
    try:
        return _seed_dsh_home(app_dir, dsh_home, force=force)
    finally:
        lease.release()


def _seed_dsh_home(app_dir: str | Path, dsh_home: str | Path, *, force: bool) -> Dict[str, Any]:
    app = Path(app_dir)
    home = Path(dsh_home)
    manifest_path = app / "product-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
    # The product search wrapper owns the former native search settings. rc.3
    # imports by entry id; map that one renamed owner before its one-shot import.
    legacy_settings = home / "settings.yaml"
    if legacy_settings.is_file():
        import yaml
        values = yaml.safe_load(legacy_settings.read_text(encoding="utf-8-sig"))
        if isinstance(values, dict) and "web-search-deepseek" in values:
            backup = home / "settings.yaml.pre-0.2.1"
            if not backup.exists():
                shutil.copy2(legacy_settings, backup)
            values.setdefault("investment-research-search", values.pop("web-search-deepseek"))
            legacy_settings.write_text(yaml.safe_dump(values, allow_unicode=True, sort_keys=False), encoding="utf-8")
    result: Dict[str, List[str]] = {"seeded": [], "kept": []}
    _seed_profiles(app / "profiles", home / "profiles", force=force)
    _copy_tree(app / "presets", home / ".agent-presets", force=force)
    _copy_tree(app / "skills", home / "skills", force=force, allowed=manifest.get("skills"))
    _install_plugins(app / "plugins", home / "profiles", force=force, allowed=manifest.get("plugins"))
    # Summarise shipped directories only. A home also contains user history,
    # backups and linked SDK trees; walking it can exceed desktop readiness.
    result["seeded"] = sorted(
        str((home / target / entry.name).relative_to(home))
        for source, target in (("profiles", "profiles"), ("presets", ".agent-presets"), ("skills", "skills"))
        if (app / source).is_dir()
        for entry in (app / source).iterdir()
        if entry.is_dir() and (home / target / entry.name).is_dir()
    )
    logger.info("DSH home seeded: %s", home)
    return result


def seed_from_env() -> bool:
    """Seed from AI_TRADING_AUTOMATION_APP_DIR/DSH_HOME when the app dir exists.

    The installed product owns profiles/presets/skills/plugins (the product
    exposes no editor for them; the user's override layer is the home-level
    cordis.patch.yml, which is never seeded). Seeding therefore refreshes the
    shipped trees on every engine start so product updates — e.g. the 2.1
    product-shell profile composition — reach existing installations. Extra
    user-created entries (extra profiles, presets, skills) are left alone;
    user DATA (sessions, workspaces, credentials, config) lives outside these
    trees and is never touched.
    """
    app_dir = (
        os.getenv("AI_TRADING_AUTOMATION_APP_DIR") or os.getenv("INVESTMENT_AUTO_APP_DIR") or ""
    ).strip()
    dsh_home = os.getenv("DSH_HOME", "").strip()
    if not app_dir or not dsh_home:
        return False
    app_path = Path(app_dir)
    if not (app_path / "profiles").exists():
        return False
    seed_dsh_home(app_path, dsh_home, force=True)
    return True

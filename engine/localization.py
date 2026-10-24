"""One language resolver for Web, desktop and new research artifacts.

DSH Host locale is authoritative for the interface. ui.language is a resolved
mirror used before the Host is ready; research rounds freeze their own value.
"""
from __future__ import annotations

from contextvars import ContextVar
from contextlib import contextmanager
from functools import wraps
import json
import os
from pathlib import Path
from typing import Any, Mapping
import yaml

TEMPLATE_VERSION = "research-2.4.0-1"
_language = ContextVar("product_output_language", default=None)


def locale_preference() -> str | None:
    from engine.config import cfg
    home = os.getenv("DSH_HOME", "")
    selected = None
    if home:
        for path in (Path(home) / "profiles/investment-web/cordis.patch.yml", Path(home) / "cordis.patch.yml"):
            if not path.is_file():
                continue
            rows = yaml.load(path.read_text(encoding="utf-8-sig"), Loader=yaml.BaseLoader)
            for row in rows if isinstance(rows, list) else []:
                if isinstance(row, dict) and row.get("id") == "locale":
                    preference = (row.get("config") or {}).get("preference")
                    if preference in {"zh", "en"}:
                        selected = preference
    return selected or (cfg.raw.get("ui", {}).get("language") if cfg.raw.get("ui", {}).get("language") in {"zh", "en"} else None)


def ui_language() -> str:
    return locale_preference() or "zh"


def persist_ui_language(language: str) -> None:
    if not isinstance(language, str) or language not in {"zh", "en"}:
        raise ValueError("language must be zh or en")
    from engine.config_api import apply_config_changes
    from engine.atomic_write import write_text_atomic
    home = os.getenv("DSH_HOME", "")
    if home:
        target = Path(home) / "profiles/investment-web/cordis.patch.yml"
        target.parent.mkdir(parents=True, exist_ok=True)
        text = target.read_text(encoding="utf-8-sig") if target.exists() else "[]\n"
        tree = yaml.compose(text, Loader=yaml.BaseLoader)
        row = "- id: locale\n  config:\n    preference: " + language + "\n"
        found = False
        if isinstance(tree, yaml.SequenceNode):
            for entry in tree.value:
                if isinstance(entry, yaml.MappingNode) and any(key.value == "id" and value.value == "locale" for key, value in entry.value):
                    # Include the list prefix, which is outside MappingNode's span.
                    start = text.rfind("\n", 0, entry.start_mark.index) + 1
                    text = text[:start] + row + text[entry.end_mark.index:]
                    found = True
                    break
        else:
            raise ValueError("Invalid DSH profile patch; language was not saved")
        if not found:
            text = ("" if not tree.value else text.rstrip()+"\n") + row
        write_text_atomic(target, text)
    apply_config_changes({"ui.language":language})


def output_language() -> str:
    from engine.config import cfg
    value = cfg.raw.get("research", {}).get("output_language", "follow-ui")
    return value if value in {"zh", "en"} else ui_language()


def current_language() -> str:
    return _language.get() or "zh"


def render_in_run_language(function):
    @wraps(function)
    def render(run: Mapping[str, Any], *args, **kwargs):
        # Missing fields belong to historical Chinese rounds, never today's UI.
        autonomous = run.get("autonomous") if isinstance(run.get("autonomous"), Mapping) else {}
        token = _language.set("en" if run.get("output_language", autonomous.get("output_language")) == "en" else "zh")
        try:
            return function(run, *args, **kwargs)
        finally:
            _language.reset(token)
    return render


_MESSAGES = None


def message(key: str, *, language: str | None = None, **params: Any) -> str:
    global _MESSAGES
    if _MESSAGES is None:
        _MESSAGES = json.loads((Path(__file__).parent / "locales/messages.json").read_text(encoding="utf-8"))
    return _MESSAGES[key][language or current_language()].format_map(params)


@contextmanager
def language_scope(language: str):
    token = _language.set(language if language in {"zh", "en"} else "zh")
    try:
        yield
    finally:
        _language.reset(token)


def render_with_language(function):
    @wraps(function)
    def render(*args, **kwargs):
        language = kwargs.pop("language", None) or _language.get() or output_language()
        with language_scope(language):
            return function(*args, **kwargs)
    return render


class LocalizedError(ValueError):
    """Stable API identity with localized, backward-compatible message text."""
    def __init__(self, key: str, **params: Any):
        self.key = key
        self.code = key.upper().replace(".", "_")
        self.params = params
        super().__init__(key)

    def __str__(self) -> str:
        try:
            language = ui_language()
        except Exception:
            language = "zh"
        return message(self.key, language=language, **self.params)

"""Small user settings file (settings.json)."""
import json

from jacestore.paths import data_dir

DEFAULTS = {"channel": "release", "check_self_updates": True, "all_platforms": False, "flathub_links": True}


def load() -> dict:
    try:
        return {**DEFAULTS, **json.loads((data_dir() / "settings.json").read_text(encoding="utf-8"))}
    except (OSError, ValueError):
        return dict(DEFAULTS)


def save(**changes):
    s = {**load(), **changes}
    (data_dir() / "settings.json").write_text(json.dumps(s, indent=2), encoding="utf-8")
    return s

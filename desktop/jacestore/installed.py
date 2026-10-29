"""What Jace Store has installed, and how to remove it again (installed.json)."""
import json
import threading
import time

from jacestore.paths import data_dir

_lock = threading.Lock()


def _path():
    return data_dir() / "installed.json"


def load() -> dict:
    try:
        return json.loads(_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save(db: dict):
    p = _path()
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(db, indent=2), encoding="utf-8")
    tmp.replace(p)


def key(source: str, ident: str) -> str:
    return f"{source}:{ident}"


def put(source: str, ident: str, record: dict):
    with _lock:
        db = load()
        db[key(source, ident)] = {**record, "source": source, "id": ident, "installed_at": time.time()}
        _save(db)


def remove(source: str, ident: str):
    with _lock:
        db = load()
        db.pop(key(source, ident), None)
        _save(db)


def get(source: str, ident: str) -> dict | None:
    return load().get(key(source, ident))


def store_installed() -> list[dict]:
    """Jace Store projects installed by us (for the update check)."""
    return [r for r in load().values() if r.get("source") == "jacestore"]

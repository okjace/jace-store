"""Client for the Jace Store desktop API (/api/desktop/v1)."""
import os
from urllib.parse import quote

from jacestore import STORE_URL
from jacestore.net import get_json, session
from jacestore.system import detect

BASE = os.environ.get("JACE_STORE_URL", STORE_URL).rstrip("/") + "/api/desktop/v1"


def _q(extra: dict | None = None) -> dict:
    q = detect().query()
    q.update({k: v for k, v in (extra or {}).items() if v not in (None, "")})
    return q


def featured(limit=12) -> dict:
    return get_json(f"{BASE}/featured", params={"os": detect().os, "limit": limit})


def search(q="", type_=None, category=None, sort="downloads", page=1, limit=24, all_platforms=False) -> dict:
    params = {"q": q, "type": type_, "category": category, "sort": sort, "page": page, "limit": limit}
    if not all_platforms:
        params["os"] = detect().os
    return get_json(f"{BASE}/search", params={k: v for k, v in params.items() if v not in (None, "")})


def project(slug: str) -> dict:
    return get_json(f"{BASE}/project/{quote(slug)}")


def resolve(slug: str, channel="release") -> dict | None:
    """The file to install on this computer, or None if there's no compatible download."""
    r = session.get(f"{BASE}/project/{quote(slug)}/resolve", params=_q({"channel": channel}), timeout=20)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()


def updates(installed: list[dict]) -> dict:
    r = session.post(f"{BASE}/updates", params=_q(), json={"installed": installed}, timeout=30)
    r.raise_for_status()
    return r.json().get("results", {})


def meta() -> dict:
    return get_json(f"{BASE}/meta")

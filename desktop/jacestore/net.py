"""HTTP with a proper User-Agent, plus downloads with progress and hash checks."""
import hashlib
import os
from pathlib import Path

import requests

from jacestore import APP_VERSION, STORE_URL

session = requests.Session()
session.headers["User-Agent"] = f"JaceStoreDesktop/{APP_VERSION} (+{STORE_URL}/desktop)"


from jacestore.cancel import Cancelled, current as current_token  # noqa: E402 - re-exported


def get_json(url: str, **kw):
    r = session.get(url, timeout=kw.pop("timeout", 20), **kw)
    r.raise_for_status()
    return r.json()


def download(url: str, dest: Path, progress=None, sha1: str | None = None, cancel=None) -> Path:
    """Download to dest (via dest.part), check sha1 if given. progress(done, total)."""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    h = hashlib.sha1()
    with session.get(url, stream=True, timeout=30, allow_redirects=True) as r:
        r.raise_for_status()
        total = int(r.headers.get("Content-Length") or 0) or None
        done = 0
        with open(part, "wb") as f:
            tok = current_token()
            for chunk in r.iter_content(1 << 16):
                if (cancel and cancel()) or (tok and tok.cancelled):
                    f.close()
                    part.unlink(missing_ok=True)
                    raise Cancelled()
                f.write(chunk)
                h.update(chunk)
                done += len(chunk)
                if progress:
                    progress(done, total)
    if sha1 and h.hexdigest() != sha1.lower():
        part.unlink(missing_ok=True)
        raise RuntimeError(f"The download of {dest.name} is damaged or was changed (checksum mismatch). Try again.")
    os.replace(part, dest)
    return dest


def unique_path(folder: Path, name: str) -> Path:
    """folder/name, or folder/name (2) etc. if it's taken."""
    p = folder / name
    if not p.exists():
        return p
    stem, suffix = (name.split(".", 1) + [""])[:2]
    for i in range(2, 1000):
        p = folder / (f"{stem} ({i})" + (f".{suffix}" if suffix else ""))
        if not p.exists():
            return p
    return folder / name

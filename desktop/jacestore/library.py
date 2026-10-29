"""My apps: your own library of apps that aren't from a package manager.

Add any program by hand (with your own logo), or let Jace Store add every app already on this
computer. The library only lives on this computer (library.json); nothing here is ever uploaded
to Jace Store or shown to anyone else.
"""
import configparser
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from jacestore.paths import data_dir
from jacestore.system import child_env, which

_lock = threading.Lock()


def _file() -> Path:
    return data_dir() / "library.json"


def icons_dir() -> Path:
    d = data_dir() / "library-icons"
    d.mkdir(parents=True, exist_ok=True)
    return d


def load() -> list[dict]:
    try:
        return json.loads(_file().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def _save(apps: list[dict]):
    tmp = _file().with_suffix(".tmp")
    tmp.write_text(json.dumps(apps, indent=2), encoding="utf-8")
    tmp.replace(_file())


def add(name: str, target: str, kind: str = "exec", icon: str | None = None, website: str = "", notes: str = "",
        origin: str = "manual", system_id: str | None = None, args: str = "") -> dict:
    """kind: exec (a program file), desktop (a Linux .desktop entry), app (a macOS .app), shortcut (a Windows .lnk), url."""
    entry = {"id": uuid.uuid4().hex[:12], "name": name.strip() or "App", "kind": kind, "target": target, "args": args,
             "icon": icon, "website": website, "notes": notes, "origin": origin, "system_id": system_id or target,
             "added_at": time.time()}
    with _lock:
        apps = load()
        apps.append(entry)
        _save(apps)
    return entry


def update(app_id: str, **changes) -> dict | None:
    with _lock:
        apps = load()
        for a in apps:
            if a["id"] == app_id:
                a.update(changes)
                _save(apps)
                return a
    return None


def remove(app_id: str):
    with _lock:
        apps = load()
        gone = [a for a in apps if a["id"] == app_id]
        _save([a for a in apps if a["id"] != app_id])
    for a in gone:
        if a.get("icon") and Path(a["icon"]).parent == icons_dir():
            Path(a["icon"]).unlink(missing_ok=True)


def set_logo(app_id: str, image_file: str) -> str:
    """Copy a picture in as this app's logo (scaled by the UI when shown). Returns its new path."""
    src = Path(image_file)
    dest = icons_dir() / f"{app_id}-{int(time.time())}{src.suffix.lower() or '.png'}"
    shutil.copy2(src, dest)
    old = next((a.get("icon") for a in load() if a["id"] == app_id), None)
    update(app_id, icon=str(dest), custom_icon=True)
    if old and Path(old).parent == icons_dir():
        Path(old).unlink(missing_ok=True)
    return str(dest)


def launch(app: dict) -> None:
    kind, target = app.get("kind"), app.get("target", "")
    env = child_env()
    args = app.get("args", "").split() if app.get("args") else []
    if kind == "url":
        import webbrowser
        webbrowser.open(target)
    elif kind == "desktop":
        stem = Path(target).stem
        if which("gtk-launch"):
            subprocess.Popen(["gtk-launch", stem], env=env, start_new_session=True)
        elif which("gio"):
            subprocess.Popen(["gio", "launch", target], env=env, start_new_session=True)
        else:
            exe = desktop_exec(target)
            if not exe:
                raise RuntimeError("Couldn't work out how to start this app.")
            subprocess.Popen(exe, env=env, start_new_session=True)
    elif sys.platform == "darwin":
        subprocess.Popen(["open", target, *(["--args", *args] if args else [])], env=env)
    elif sys.platform == "win32":
        if args:
            subprocess.Popen([target, *args], cwd=str(Path(target).parent), env=env)
        else:
            os.startfile(target)  # noqa: S606 - starting the program the user picked
    else:
        subprocess.Popen([target, *args], env=env, start_new_session=True, cwd=str(Path(target).parent))


# --- adding everything on this computer -------------------------------------------------------------------

def _desktop_dirs() -> list[Path]:
    home = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    dirs = [home, *[Path(d) for d in os.environ.get("XDG_DATA_DIRS", "/usr/local/share:/usr/share").split(":") if d],
            Path("/var/lib/flatpak/exports/share"), Path.home() / ".local/share/flatpak/exports/share", Path("/var/lib/snapd/desktop")]
    seen, out = set(), []
    for d in dirs:
        a = d / "applications"
        if a.is_dir() and a.resolve() not in seen:
            seen.add(a.resolve())
            out.append(a)
    return out


def read_desktop(path: Path) -> dict:
    cp = configparser.ConfigParser(interpolation=None, strict=False)
    cp.optionxform = str
    try:
        cp.read(path, encoding="utf-8")
    except (configparser.Error, UnicodeDecodeError):
        return {}
    return dict(cp["Desktop Entry"]) if cp.has_section("Desktop Entry") else {}


def desktop_exec(path: str) -> list[str] | None:
    import shlex
    ex = read_desktop(Path(path)).get("Exec")
    if not ex:
        return None
    return [p for p in shlex.split(ex) if not (p.startswith("%") and len(p) == 2)]


def find_icon(name: str | None) -> str | None:
    """A Linux icon name (from a .desktop file) -> the best picture file for it."""
    if not name:
        return None
    if os.path.isabs(name):
        return name if os.path.exists(name) else None
    roots = []
    for d in _desktop_dirs():
        roots += [d.parent / "icons", d.parent / "pixmaps"]
    roots += [Path.home() / ".icons", Path("/usr/share/pixmaps")]
    sizes = ["512x512", "256x256", "scalable", "192x192", "128x128", "96x96", "64x64", "48x48"]
    themes = ["hicolor"]
    for root in roots:
        if not root.is_dir():
            continue
        for ext in (".png", ".svg", ".xpm"):
            if (root / f"{name}{ext}").exists():
                return str(root / f"{name}{ext}")
        for theme in themes + [t.name for t in root.iterdir() if t.is_dir() and t.name not in themes][:6]:
            for size in sizes:
                for ext in (".png", ".svg"):
                    f = root / theme / size / "apps" / f"{name}{ext}"
                    if f.exists():
                        return str(f)
    return None


def scan_system() -> list[dict]:
    """Every app installed on this computer, as library entries (not saved yet)."""
    found = []
    if sys.platform.startswith("linux"):
        names = set()
        for d in _desktop_dirs():
            for f in sorted(d.glob("*.desktop")):
                e = read_desktop(f)
                if e.get("Type", "Application") != "Application" or e.get("NoDisplay", "").lower() == "true" \
                        or e.get("Hidden", "").lower() == "true" or not e.get("Name") or not e.get("Exec"):
                    continue
                if f.name in names:
                    continue                     # the user's copy wins over the system one
                names.add(f.name)
                found.append({"name": e["Name"], "kind": "desktop", "target": str(f), "icon": find_icon(e.get("Icon")),
                              "notes": e.get("Comment", ""), "system_id": f.name})
    elif sys.platform == "darwin":
        for root in (Path("/Applications"), Path.home() / "Applications", Path("/System/Applications"), Path("/Applications/Utilities")):
            if root.is_dir():
                for app in sorted(root.glob("*.app")):
                    found.append({"name": app.stem, "kind": "app", "target": str(app), "icon": None, "system_id": app.name})
    elif sys.platform == "win32":
        roots = [Path(os.environ.get("APPDATA", "")) / "Microsoft/Windows/Start Menu/Programs",
                 Path(os.environ.get("PROGRAMDATA", "C:/ProgramData")) / "Microsoft/Windows/Start Menu/Programs"]
        skip = ("uninstall", "readme", "help", "documentation", "website", "license", "release notes", "manual")
        seen = set()
        for root in roots:
            if root.is_dir():
                for lnk in sorted(root.rglob("*.lnk")):
                    n = lnk.stem
                    if any(s in n.lower() for s in skip) or n.lower() in seen:
                        continue
                    seen.add(n.lower())
                    found.append({"name": n, "kind": "shortcut", "target": str(lnk), "icon": None, "system_id": n.lower()})
    return sorted(found, key=lambda a: a["name"].lower())


def import_system(entries: list[dict]) -> int:
    """Add scanned apps that aren't in the library yet. Returns how many were added."""
    have = {a.get("system_id") for a in load()}
    added = 0
    for e in entries:
        if e["system_id"] in have:
            continue
        add(e["name"], e["target"], e["kind"], e.get("icon"), "", e.get("notes", ""), "system", e["system_id"])
        added += 1
    return added

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


# --- uninstalling the program itself -------------------------------------------------------------------------

def _owner_package(path: str) -> tuple[str, str] | None:
    """(package manager, package) that owns a file, e.g. ("pacman", "firefox")."""
    from jacestore.system import detect
    pm = detect().package_manager
    try:
        if pm == "pacman":
            r = subprocess.run(["pacman", "-Qoq", path], capture_output=True, text=True, env=child_env())
        elif pm == "apt":
            r = subprocess.run(["dpkg-query", "-S", path], capture_output=True, text=True, env=child_env())
            if r.returncode == 0:
                return ("apt", r.stdout.split(":", 1)[0].split(",")[0].strip())
            return None
        elif pm in ("dnf", "zypper"):
            r = subprocess.run(["rpm", "-qf", "--qf", "%{NAME}", path], capture_output=True, text=True, env=child_env())
        else:
            return None
    except FileNotFoundError:
        return None
    name = r.stdout.strip().splitlines()[0] if r.returncode == 0 and r.stdout.strip() else ""
    return (pm, name) if name else None


def _lnk_target(lnk: str) -> str:
    q = lnk.replace("'", "''")
    r = subprocess.run(["powershell", "-NoProfile", "-Command", f"(New-Object -ComObject WScript.Shell).CreateShortcut('{q}').TargetPath"],
                       capture_output=True, text=True, creationflags=0x08000000)
    return r.stdout.strip()


def _windows_uninstaller(name: str, target: str) -> dict | None:
    """The 'Installed apps' entry for a program: matched by install folder, then by name."""
    import winreg
    keys = [(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
            (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
            (winreg.HKEY_LOCAL_MACHINE, r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall")]
    entries = []
    for hive, path in keys:
        try:
            root = winreg.OpenKey(hive, path)
        except OSError:
            continue
        for i in range(winreg.QueryInfoKey(root)[0]):
            try:
                with winreg.OpenKey(root, winreg.EnumKey(root, i)) as k:
                    vals = {}
                    for v in ("DisplayName", "UninstallString", "QuietUninstallString", "InstallLocation", "DisplayIcon"):
                        try:
                            vals[v] = str(winreg.QueryValueEx(k, v)[0])
                        except OSError:
                            pass
                    if vals.get("DisplayName") and vals.get("UninstallString"):
                        entries.append(vals)
            except OSError:
                continue
    tdir = os.path.normcase(os.path.dirname(target)) if target else ""
    for e in entries:
        loc = os.path.normcase(e.get("InstallLocation", "").strip('"').rstrip("\\"))
        icon = os.path.normcase(e.get("DisplayIcon", "").split(",")[0].strip('"'))
        if tdir and ((loc and tdir.startswith(loc)) or (icon and os.path.dirname(icon) == tdir)):
            return e
    n = name.lower()
    return next((e for e in entries if e["DisplayName"].lower() == n), None) or \
        next((e for e in entries if n and (n in e["DisplayName"].lower() or e["DisplayName"].lower() in n)), None)


def uninstall_plan(app: dict) -> dict | None:
    """How to remove this program from the computer, or None if Jace Store can't tell.
    -> {"method": ..., "what": human description, ...details}"""
    kind, target = app.get("kind"), app.get("target", "")
    if kind == "url":
        return None
    if sys.platform.startswith("linux"):
        exe = []
        if kind == "desktop":
            exe = desktop_exec(target) or []
            if "/flatpak/exports/" in target:
                app_id = Path(target).stem
                user = str(Path.home()) in target
                return {"method": "flatpak", "id": app_id, "user": user, "what": f"the Flatpak {app_id}"}
            if "/snapd/desktop/" in target or (exe and exe[0].startswith("/snap/bin/")):
                snap = (exe[0].rsplit("/", 1)[-1] if exe and exe[0].startswith("/snap/bin/") else Path(target).stem.split("_")[0]).split(".")[0]
                return {"method": "snap", "id": snap, "what": f"the Snap {snap}"}
        else:
            exe = [target]
        appimage = next((x for x in exe if x.lower().endswith(".appimage") and os.path.exists(x)), None)
        from jacestore import selfinstall
        me = selfinstall.installed_path() or selfinstall.running_package()
        if appimage and me and os.path.realpath(appimage) == os.path.realpath(str(me)):
            return {"method": "self", "what": "Jace Store itself"}
        if appimage:
            return {"method": "files", "files": [appimage] + ([target] if kind == "desktop" else []),
                    "what": f"the AppImage {Path(appimage).name} and its menu entry"}
        for path in [target if kind == "desktop" else None, *(exe[:1])]:
            if path and os.path.isabs(path):
                owner = _owner_package(path) or _owner_package(which(path) or path)
                if owner:
                    return {"method": "package", "manager": owner[0], "id": owner[1], "what": f"the {owner[0]} package {owner[1]}"}
        if kind == "desktop" and target.startswith(str(Path.home())):
            return {"method": "files", "files": [target], "what": "its menu entry (Jace Store couldn't find what installed the program)",
                    "partial": True}
        return None
    if sys.platform == "darwin":
        if kind == "app" and target.endswith(".app") and not target.startswith("/System/"):
            return {"method": "trash", "files": [target], "what": f"{Path(target).name} (moved to the Trash)"}
        return None
    if sys.platform == "win32":
        exe = _lnk_target(target) if kind == "shortcut" else target
        e = _windows_uninstaller(app.get("name", ""), exe)
        if e:
            return {"method": "windows", "command": e.get("UninstallString"), "name": e["DisplayName"],
                    "what": f"{e['DisplayName']} (its own uninstaller opens)"}
        return None
    return None


def uninstall_app(app: dict, plan: dict, log=print):
    """Remove the program from the computer, then from My apps."""
    from jacestore.installer import elevated, run
    m = plan["method"]
    if m == "flatpak":
        run(["flatpak", "uninstall", "-y", "--noninteractive", "--user" if plan.get("user") else "--system", plan["id"]], log)
    elif m == "snap":
        run(elevated(["snap", "remove", plan["id"]]), log)
    elif m == "package":
        cmd = {"pacman": ["pacman", "-R", "--noconfirm", plan["id"]], "apt": ["apt-get", "remove", "-y", plan["id"]],
               "dnf": ["dnf", "remove", "-y", plan["id"]], "zypper": ["zypper", "--non-interactive", "remove", plan["id"]]}[plan["manager"]]
        log("Asking for your password to remove a system package…")
        run(elevated(cmd), log)
    elif m == "files":
        for f in plan["files"]:
            Path(f).unlink(missing_ok=True)
            log(f"Deleted {f}")
    elif m == "trash":
        src = Path(plan["files"][0])
        trash = Path.home() / ".Trash"
        trash.mkdir(exist_ok=True)
        dest = trash / src.name
        n = 2
        while dest.exists():
            dest = trash / f"{src.stem} {n}{src.suffix}"
            n += 1
        shutil.move(str(src), str(dest))
        log(f"Moved {src.name} to the Trash")
    elif m == "windows":
        # the program's own uninstaller (it may ask for administrator permission and show its own window)
        subprocess.Popen(plan["command"], shell=True)  # noqa: S602 - the registry's UninstallString is a command line
        log(f"Opened {plan['name']}'s uninstaller")
        return
    remove(app["id"])

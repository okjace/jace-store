"""Install, open and uninstall downloaded files.

Every Jace Store file comes with a format (deb, msi, dmg, appimage, ...) and an action
the owner chose: "install" (we install it) or "open" (we download it and let the OS
open it, e.g. run the owner's own installer). install() returns a record describing
what was installed and how to remove it, which installed.py stores.
"""
import os
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import zipfile
from pathlib import Path

from jacestore import paths
from jacestore.net import download
from jacestore.system import child_env, detect, terminal_command, which

NO_WINDOW = 0x08000000  # CREATE_NO_WINDOW


class InstallError(RuntimeError):
    pass


# --- running commands ----------------------------------------------------------------

def run(cmd: list, log=print, check=True, input_text: str | None = None) -> str:
    """Run a command, stream its output to log(), return the output."""
    log("$ " + " ".join(str(c) for c in cmd))
    kw = {"creationflags": NO_WINDOW} if sys.platform == "win32" else {}
    try:
        p = subprocess.Popen([str(c) for c in cmd], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             stdin=subprocess.PIPE if input_text is not None else subprocess.DEVNULL,
                             env=child_env(), text=True, encoding="utf-8", errors="replace", **kw)
    except FileNotFoundError as e:
        raise InstallError(f"{cmd[0]} isn't installed on this computer.") from e
    if input_text is not None:
        p.stdin.write(input_text)
        p.stdin.close()
    out = []
    for line in p.stdout:
        line = line.rstrip()
        if line:
            out.append(line)
            log(line)
    p.wait()
    text = "\n".join(out)
    if check and p.returncode != 0:
        if p.returncode in (126, 127) and cmd and str(cmd[0]).endswith("pkexec"):
            raise InstallError("Permission wasn't given (the password prompt was cancelled).")
        tail = "\n".join(out[-6:])
        raise InstallError(f"{Path(str(cmd[0])).name} failed (exit code {p.returncode}).\n{tail}".strip())
    return text


def elevated(cmd: list) -> list:
    """Run as administrator on Linux (pkexec shows the system password prompt)."""
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        return cmd
    if which("pkexec"):
        return ["pkexec", *cmd]
    raise InstallError("Installing system packages needs pkexec (polkit), which this computer doesn't have.\n"
                       "Install it, or download the file and install it in a terminal with sudo.")


def open_path(p: Path):
    """Open a file or folder the way the OS would if you double-clicked it."""
    p = Path(p)
    if sys.platform == "win32":
        os.startfile(str(p))  # noqa: S606 - opening a file the user asked to open
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(p)], env=child_env())
    else:
        subprocess.Popen(["xdg-open", str(p)], env=child_env(), start_new_session=True)


def launch(record: dict) -> bool:
    """Start an installed app. Returns False if we don't know how."""
    target = record.get("launch")
    if not target:
        return False
    kind = record.get("launch_kind") or record.get("kind")   # source installs (Flathub, Snap) say how to start them
    env = child_env()
    if kind == "flatpak":
        subprocess.Popen(["flatpak", "run", target], env=env, start_new_session=True)
    elif kind == "snap":
        subprocess.Popen(["snap", "run", target], env=env, start_new_session=True)
    elif sys.platform == "darwin":
        subprocess.Popen(["open", target], env=env)
    elif sys.platform == "win32":
        os.startfile(target)  # noqa: S606
    elif record.get("desktop_file") and which("gtk-launch"):
        subprocess.Popen(["gtk-launch", Path(record["desktop_file"]).stem], env=env, start_new_session=True)
    else:
        subprocess.Popen([target], env=env, start_new_session=True, cwd=str(Path(target).parent))
    return True


# --- helpers -----------------------------------------------------------------------------

def slug_name(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", s).strip("-") or "app"


def safe_title(s: str) -> str:
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", s).strip() or "App"


def _extract(archive: Path, dest: Path):
    dest.mkdir(parents=True, exist_ok=True)
    name = archive.name.lower()
    if name.endswith((".zip", ".app.zip")):
        if sys.platform == "darwin":
            subprocess.run(["ditto", "-x", "-k", str(archive), str(dest)], check=True)  # keeps app bundles intact
            return
        with zipfile.ZipFile(archive) as z:
            for info in z.infolist():
                out = z.extract(info, dest)       # zipfile strips ../ and absolute paths
                mode = info.external_attr >> 16   # keep the executable bit (zipfile drops it)
                if mode & 0o111 and not info.is_dir():
                    os.chmod(out, (mode & 0o777) | stat.S_IRUSR)
    elif name.endswith(".7z"):
        if not which("7z"):
            raise InstallError("This app is a .7z archive; install 7-Zip to extract it.")
        run(["7z", "x", "-y", f"-o{dest}", archive])
    else:
        with tarfile.open(archive) as t:
            t.extractall(dest, filter="data")
    # an archive with one folder inside: use that folder
    entries = [e for e in dest.iterdir() if e.name not in ("__MACOSX", ".DS_Store")]
    if len(entries) == 1 and entries[0].is_dir() and entries[0].suffix != ".app":
        inner = entries[0]
        tmp = dest.with_name(dest.name + ".flatten")
        inner.rename(tmp)
        shutil.rmtree(dest)
        tmp.rename(dest)


_NOT_MAIN = re.compile(r"(unins|uninstall|setup|install|crash|update|helper|redist|dxsetup|elevate|vcredist|reporter|notification)", re.I)


def find_main_program(folder: Path, title: str) -> Path | None:
    """Best guess at an extracted app's main program (the one to put a shortcut to)."""
    words = [w for w in re.split(r"[^a-z0-9]+", title.lower()) if len(w) > 1]
    best, best_score = None, -1e9
    for f in folder.rglob("*"):
        if not f.is_file() or f.is_symlink():
            continue
        depth = len(f.relative_to(folder).parts)
        if depth > 4:
            continue
        if sys.platform == "win32":
            if f.suffix.lower() != ".exe":
                continue
        elif f.suffix.lower() == ".appimage":
            pass
        elif not os.access(f, os.X_OK) or f.suffix.lower() in (".so", ".dll", ".dylib", ".py", ".txt") or ".so." in f.name:
            continue
        score = -depth * 10
        stem = f.stem.lower()
        score += sum(8 for w in words if w in stem)
        if _NOT_MAIN.search(f.name):
            score -= 40
        if f.suffix.lower() == ".sh":
            score -= 5
        score += min(f.stat().st_size / 5_000_000, 6)
        if score > best_score:
            best, best_score = f, score
    return best


# --- Linux desktop entries ------------------------------------------------------------------

def _apps_menu_dir() -> Path:
    d = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "applications"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _fetch_icon(icon_url: str | None, slug: str) -> str | None:
    if not icon_url:
        return None
    try:
        ext = os.path.splitext(icon_url.split("?")[0])[1] or ".png"
        p = paths.data_dir() / "icons" / f"{slug_name(slug)}{ext}"
        if not p.exists():
            download(icon_url, p)
        return str(p)
    except Exception:  # noqa: BLE001 - an icon is nice to have, never worth failing an install
        return None


def write_desktop_entry(slug: str, title: str, exec_path: Path, icon: str | None, comment: str = "") -> Path:
    f = _apps_menu_dir() / f"jacestore-{slug_name(slug)}.desktop"
    ex = str(exec_path).replace('"', '\\"')
    f.write_text("\n".join([
        "[Desktop Entry]", "Type=Application", f"Name={title}", f"Comment={comment}".rstrip(),
        f'Exec="{ex}" %U', f"Path={exec_path.parent}", f"Icon={icon or 'application-x-executable'}",
        "Terminal=false", "Categories=Utility;", "X-JaceStore=true", "",
    ]), encoding="utf-8")
    f.chmod(0o755)
    if which("update-desktop-database"):
        subprocess.run(["update-desktop-database", str(f.parent)], env=child_env(), capture_output=True)
    return f


# --- Windows shortcuts ----------------------------------------------------------------------

def _start_menu() -> Path:
    import ctypes
    buf = ctypes.create_unicode_buffer(260)
    ctypes.windll.shell32.SHGetFolderPathW(None, 0x02, None, 0, buf)  # CSIDL_PROGRAMS
    return Path(buf.value)


def make_shortcut(lnk: Path, target: Path, description=""):
    q = lambda p: str(p).replace("'", "''")  # noqa: E731 - PowerShell single-quote escaping
    ps = (f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{q(lnk)}');"
          f"$s.TargetPath='{q(target)}';$s.WorkingDirectory='{q(target.parent)}';"
          f"$s.IconLocation='{q(target)},0';$s.Description='{q(description)}';$s.Save()")
    lnk.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
                       creationflags=NO_WINDOW, capture_output=True, text=True, errors="replace")
    if r.returncode != 0 or not lnk.exists():
        raise InstallError(f"Couldn't create the shortcut {lnk.name}: {(r.stderr or r.stdout).strip()[-500:]}")


def _powershell(cmd: str, log=print) -> str:
    return run(["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmd], log)


# --- set-difference trick: what did the package manager add? --------------------------------

def _flatpak_apps() -> set:
    out = subprocess.run(["flatpak", "list", "--app", "--columns=application"], capture_output=True, text=True, env=child_env()).stdout
    return {line.strip() for line in out.splitlines() if line.strip()}


def _snaps() -> set:
    out = subprocess.run(["snap", "list"], capture_output=True, text=True, env=child_env()).stdout
    return {line.split()[0] for line in out.splitlines()[1:] if line.split()}


def _appx() -> set:
    out = subprocess.run(["powershell", "-NoProfile", "-Command", "Get-AppxPackage | ForEach-Object { $_.PackageFullName }"],
                         capture_output=True, text=True, creationflags=NO_WINDOW).stdout
    return {line.strip() for line in out.splitlines() if line.strip()}


# --- install ------------------------------------------------------------------------------

def install_file(path: Path, fmt: str, *, slug: str, title: str, icon_url: str | None = None, log=print) -> dict:
    """Install a downloaded file. Returns the record for installed.py."""
    sysinfo = detect()
    path = Path(path).resolve()

    if sysinfo.os == "linux":
        if fmt in ("deb", "rpm", "pacman"):
            return _install_linux_package(path, fmt, sysinfo, log)
        if fmt == "appimage":
            dest = paths.apps_dir() / f"{safe_title(title)}.AppImage"
            if dest.exists():
                dest.unlink()
            shutil.move(str(path), dest)
            dest.chmod(0o755)
            entry = write_desktop_entry(slug, title, dest, _fetch_icon(icon_url, slug))
            log(f"Installed to {dest} and added to your app menu")
            return {"kind": "appimage", "paths": [str(dest), str(entry)], "launch": str(dest), "desktop_file": str(entry)}
        if fmt in ("flatpakref", "flatpak"):
            if not which("flatpak"):
                raise InstallError("This app is a Flatpak, but Flatpak isn't installed. Install it from your distro's packages first.")
            before = _flatpak_apps()
            run(["flatpak", "install", "--user", "-y", "--noninteractive",
                 "--from" if fmt == "flatpakref" else "--bundle", path], log)
            new = sorted(_flatpak_apps() - before)
            return {"kind": "flatpak", "package": new[0] if new else None, "launch": new[0] if new else None}
        if fmt == "snap":
            before = _snaps()
            run(elevated(["snap", "install", "--dangerous", path]), log)
            new = sorted(_snaps() - before)
            return {"kind": "snap", "package": new[0] if new else None, "launch": new[0] if new else None}
        if fmt in ("zip", "tar"):
            return _install_folder(path, slug, title, icon_url, log)

    if sysinfo.os == "windows":
        if fmt == "msi":
            keep = paths.packages_dir() / slug_name(slug) / path.name
            keep.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, keep)
            # msiexec asks for administrator permission itself if the package needs it
            run(["msiexec", "/i", keep, "/passive", "/norestart"], log)
            return {"kind": "msi", "paths": [str(keep)]}
        if fmt == "msix":
            before = _appx()
            _powershell(f"Add-AppxPackage -Path '{str(path).replace(chr(39), chr(39) * 2)}'", log)
            new = sorted(_appx() - before)
            return {"kind": "msix", "package": new[0] if new else None}
        if fmt == "exe":
            # "install" for a plain .exe = a portable app: copy it in and add a Start menu shortcut
            folder = paths.apps_dir() / safe_title(title)
            folder.mkdir(parents=True, exist_ok=True)
            exe = folder / path.name
            shutil.copy2(path, exe)
            lnk = _start_menu() / f"{safe_title(title)}.lnk"
            make_shortcut(lnk, exe, title)
            log(f"Installed to {folder} and added to the Start menu")
            return {"kind": "folder", "paths": [str(folder), str(lnk)], "launch": str(exe)}
        if fmt == "zip":
            return _install_folder(path, slug, title, icon_url, log)

    if sysinfo.os == "macos":
        if fmt == "dmg":
            return _install_dmg(path, log)
        if fmt in ("app_zip", "zip"):
            work = Path(tempfile.mkdtemp(prefix="jacestore-"))
            _extract(path, work)
            apps = sorted(work.rglob("*.app"), key=lambda p: len(p.parts))
            if not apps:
                shutil.rmtree(work, ignore_errors=True)
                raise InstallError("There's no app (.app) inside this .zip.")
            return _place_mac_app(apps[0], log, cleanup=work)
        if fmt == "pkg":
            cmd = f"installer -pkg {_sh(str(path))} -target /"
            run(["osascript", "-e", f"do shell script {_as(cmd)} with administrator privileges"], log)
            return {"kind": "pkg"}

    raise InstallError(f"Jace Store can't install {path.name} on this computer. Try \"Download and open\" instead.")


def _sh(s: str) -> str:
    return "'" + s.replace("'", "'\\''") + "'"


def _as(s: str) -> str:
    """AppleScript string literal."""
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _package_name(path: Path, fmt: str) -> str | None:
    try:
        if fmt == "deb":
            return subprocess.run(["dpkg-deb", "-f", str(path), "Package"], capture_output=True, text=True, env=child_env()).stdout.strip() or None
        if fmt == "rpm":
            return subprocess.run(["rpm", "-qp", "--qf", "%{NAME}", str(path)], capture_output=True, text=True, env=child_env()).stdout.strip() or None
        if fmt == "pacman":
            out = subprocess.run(["pacman", "-Qip", str(path)], capture_output=True, text=True, env=child_env()).stdout
            m = re.search(r"^Name\s*:\s*(\S+)", out, re.M)
            return m.group(1) if m else None
    except FileNotFoundError:
        return None
    return None


def _install_linux_package(path: Path, fmt: str, sysinfo, log) -> dict:
    pm = sysinfo.package_manager
    want = {"deb": ("apt",), "rpm": ("dnf", "zypper"), "pacman": ("pacman",)}[fmt]
    if pm not in want:
        raise InstallError(f"This is a .{'pkg.tar.zst' if fmt == 'pacman' else fmt} package, which {sysinfo.distro or 'your distro'} "
                           f"doesn't use. Pick another download for your computer.")
    if sysinfo.immutable:
        raise InstallError("Your system is read-only (an immutable distro), so packages can't be installed directly. "
                           "Use a Flatpak or AppImage version instead.")
    name = _package_name(path, fmt)
    cmd = {
        "apt": ["env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "install", "-y", path],
        "dnf": ["dnf", "install", "-y", path],
        "zypper": ["zypper", "--non-interactive", "install", "--allow-unsigned-rpm", path],
        "pacman": ["pacman", "-U", "--noconfirm", path],
    }[pm]
    log("Asking for your password to install a system package…")
    run(elevated(cmd), log)
    return {"kind": "package", "manager": pm, "package": name}


def _install_folder(archive: Path, slug: str, title: str, icon_url: str | None, log) -> dict:
    folder = paths.apps_dir() / safe_title(title)
    if folder.exists():
        shutil.rmtree(folder)
    log(f"Extracting to {folder}")
    _extract(archive, folder)
    main = find_main_program(folder, title)
    rec = {"kind": "folder", "paths": [str(folder)]}
    if not main:
        log("Couldn't tell which program to start, so no shortcut was made. The folder will open.")
        open_path(folder)
        return rec
    rec["launch"] = str(main)
    if sys.platform == "win32":
        lnk = _start_menu() / f"{safe_title(title)}.lnk"
        make_shortcut(lnk, main, title)
        rec["paths"].append(str(lnk))
    else:
        main.chmod(main.stat().st_mode | 0o111)
        entry = write_desktop_entry(slug, title, main, _fetch_icon(icon_url, slug))
        rec["paths"].append(str(entry))
        rec["desktop_file"] = str(entry)
    log(f"Installed {title}: {main.name}")
    return rec


def _place_mac_app(app: Path, log, cleanup: Path | None = None) -> dict:
    dest = paths.apps_dir() / app.name
    tmp = dest.with_name(f".{app.name}.installing")
    shutil.rmtree(tmp, ignore_errors=True)
    run(["ditto", app, tmp], log)
    if dest.exists():
        shutil.rmtree(dest)
    tmp.rename(dest)
    subprocess.run(["xattr", "-dr", "com.apple.quarantine", str(dest)], capture_output=True)
    if cleanup:
        shutil.rmtree(cleanup, ignore_errors=True)
    log(f"Installed {dest}")
    return {"kind": "mac_app", "paths": [str(dest)], "launch": str(dest)}


def _install_dmg(path: Path, log) -> dict:
    mnt = Path(tempfile.mkdtemp(prefix="jacestore-dmg-"))
    # disk images with a license agreement wait for "Y" on stdin
    run(["hdiutil", "attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mnt, path], log, input_text="Y\n")
    try:
        apps = sorted(mnt.glob("*.app")) or sorted(mnt.glob("*/*.app"))
        if apps:
            return _place_mac_app(apps[0], log)
        pkgs = sorted(mnt.glob("*.pkg")) + sorted(mnt.glob("*.mpkg"))
        if pkgs:
            cmd = f"installer -pkg {_sh(str(pkgs[0]))} -target /"
            run(["osascript", "-e", f"do shell script {_as(cmd)} with administrator privileges"], log)
            return {"kind": "pkg"}
        raise InstallError("There's no app inside this disk image.")
    finally:
        subprocess.run(["hdiutil", "detach", str(mnt), "-quiet", "-force"], capture_output=True)


# --- "download, then open" ---------------------------------------------------------------------

def open_downloaded(path: Path, fmt: str, log=print) -> dict:
    """Open a downloaded file with the OS (run the installer, mount the disk image...)."""
    path = Path(path)
    if sys.platform.startswith("linux") and fmt in ("appimage", "sh"):
        path.chmod(path.stat().st_mode | 0o755)
        if fmt == "appimage":
            subprocess.Popen([str(path)], env=child_env(), start_new_session=True, cwd=str(path.parent))
        else:
            term = terminal_command(["bash", str(path)])
            if not term:
                raise InstallError(f"Couldn't find a terminal to run {path.name}. Run it yourself:  bash {path}")
            subprocess.Popen(term, env=child_env(), start_new_session=True)
    else:
        open_path(path)
    log(f"Opened {path.name}")
    return {"kind": "opened", "paths": [str(path)]}


# --- uninstall -----------------------------------------------------------------------------

def can_uninstall(record: dict) -> bool:
    k = record.get("kind")
    if k in ("flatpak", "snap", "msix", "package"):
        return bool(record.get("package"))
    return k in ("appimage", "folder", "msi", "mac_app", "source")


def uninstall(record: dict, log=print):
    kind = record.get("kind")
    if kind == "package":
        pm, name = record.get("manager"), record.get("package")
        cmd = {"apt": ["apt-get", "remove", "-y", name], "dnf": ["dnf", "remove", "-y", name],
               "zypper": ["zypper", "--non-interactive", "remove", name], "pacman": ["pacman", "-R", "--noconfirm", name]}[pm]
        run(elevated(cmd), log)
    elif kind == "flatpak":
        run(["flatpak", "uninstall", "-y", "--noninteractive", record["package"]], log)
    elif kind == "snap":
        run(elevated(["snap", "remove", record["package"]]), log)
    elif kind == "msi":
        msi = Path(record["paths"][0])
        run(["msiexec", "/x", msi, "/passive", "/norestart"], log)
        shutil.rmtree(msi.parent, ignore_errors=True)
    elif kind == "msix":
        _powershell(f"Remove-AppxPackage -Package '{record['package']}'", log)
    elif kind in ("appimage", "folder", "mac_app"):
        for p in map(Path, record.get("paths", [])):
            for _ in range(3):
                try:
                    if p.is_dir() and not p.is_symlink():
                        shutil.rmtree(p)
                    elif p.exists() or p.is_symlink():
                        p.unlink()
                    break
                except PermissionError:
                    time.sleep(1)   # Windows: the app may still be closing
            log(f"Removed {p}")
    else:
        raise InstallError("Jace Store can't remove this one by itself. Uninstall it from your system settings.")

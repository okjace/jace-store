"""Jace Store installs, updates and removes itself (no separate installer program).

  Windows  the release is one .exe (PyInstaller onefile) that carries a small "onedir"
           launcher. Setup copies its unpacked files + that launcher into
           %LOCALAPPDATA%\\Programs\\Jace Store, adds shortcuts, the "Installed apps" entry
           and the jacestore:// link handler.
  macOS    the release is Jace Store.app (zipped); setup moves it into Applications.
  Linux    the release is an AppImage; setup copies it to ~/Applications and adds a
           menu entry (with the jacestore:// handler).
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

from jacestore import APP_ID, APP_NAME, APP_VERSION, AUTHOR, GITHUB_URL, URL_SCHEME
from jacestore.system import child_env, which

HOME = Path.home()
WIN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\JaceStore"
WIN_EXE = "JaceStore.exe"
EMBEDDED_DIR = "jace_setup"
MAC_APP = f"{APP_NAME}.app"
LINUX_FILE = "JaceStore.AppImage"
NO_WINDOW = 0x08000000

OPTIONS = {
    "win32": [("startmenu", "Add to the Start menu", True), ("desktop", "Create a desktop shortcut", True),
              ("apps", "Show in Windows \"Installed apps\"", True)],
    "darwin": [("dock", "Keep in the Dock", True), ("unquarantine", "Remove the \"downloaded from the internet\" flag", True)],
    "linux": [("menu", "Add to the app menu", True), ("desktop", "Create a desktop shortcut", False)],
}


def options() -> list:
    return OPTIONS["linux" if sys.platform.startswith("linux") else sys.platform]


def frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


# --- where things are -------------------------------------------------------------------

def default_dir() -> Path:
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA", HOME / "AppData" / "Local")) / "Programs" / APP_NAME
    if sys.platform == "darwin":
        return Path("/Applications") if os.access("/Applications", os.W_OK) else HOME / "Applications"
    return HOME / "Applications"


def installed_path() -> Path | None:
    """The installed copy (exe / .app / AppImage), if Jace Store is installed."""
    if sys.platform == "win32":
        p = default_dir() / WIN_EXE
    elif sys.platform == "darwin":
        p = next((d / MAC_APP for d in (Path("/Applications"), HOME / "Applications") if (d / MAC_APP).exists()), None)
    else:
        p = default_dir() / LINUX_FILE
    return p if p and p.exists() else None


def running_package() -> Path | None:
    """What we're running from: the .exe, the .app or the AppImage."""
    if not frozen():
        return None
    if sys.platform == "win32":
        return Path(sys.executable)
    if sys.platform == "darwin":
        app = Path(sys.executable).resolve().parents[2]
        return app if app.suffix == ".app" else None
    return Path(os.environ["APPIMAGE"]) if os.environ.get("APPIMAGE") else None


def is_setup_build() -> bool:
    """Windows: the downloaded onefile .exe (as opposed to the installed copy)."""
    return sys.platform == "win32" and frozen() and (Path(getattr(sys, "_MEIPASS", "")) / EMBEDDED_DIR / WIN_EXE).is_file()


def running_installed() -> bool:
    pkg, inst = running_package(), installed_path()
    if not pkg or not inst:
        return False
    if sys.platform == "win32":
        return not is_setup_build() and pkg.resolve() == inst.resolve()
    return pkg.resolve() == inst.resolve()


def needs_setup() -> bool:
    """Show the setup wizard? (a packaged build that isn't the installed copy)"""
    if os.environ.get("JACE_STORE_NO_SETUP") or not frozen():
        return False
    if sys.platform.startswith("linux") and not os.environ.get("APPIMAGE"):
        return False
    return not running_installed()


def translocated(app: Path) -> bool:
    return "/AppTranslocation/" in str(app)


# --- install --------------------------------------------------------------------------------

def install(opts: dict, status=print, target_dir: Path | None = None) -> Path:
    target_dir = Path(target_dir or default_dir()).expanduser()
    target_dir.mkdir(parents=True, exist_ok=True)
    if sys.platform == "win32":
        return _install_windows(target_dir, opts, status)
    if sys.platform == "darwin":
        return _install_mac(target_dir, opts, status)
    return _install_linux(target_dir, opts, status)


def _copy_tree(src: Path, dst: Path, status, skip: str | None = None):
    files = [f for f in src.rglob("*") if f.is_file() and not (skip and f.relative_to(src).parts[0] == skip)]
    for i, f in enumerate(files):
        if i % 250 == 0:
            status(f"Copying files… {i * 100 // max(1, len(files))}%")
        out = dst / f.relative_to(src)
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, out)


def _install_windows(target: Path, opts, status) -> Path:
    import winreg
    from jacestore.installer import _start_menu, make_shortcut
    exe = target / WIN_EXE
    internal = target / "_internal"
    if is_setup_build():
        # stage next to the old files, then swap, so a failed copy never leaves a broken app
        stage, old = target / "_internal.new", target / "_internal.old"
        shutil.rmtree(stage, ignore_errors=True)
        _copy_tree(Path(sys._MEIPASS), stage, status, skip=EMBEDDED_DIR)
        shutil.rmtree(old, ignore_errors=True)
        if internal.exists():
            internal.rename(old)
        stage.rename(internal)
        shutil.copy2(Path(sys._MEIPASS) / EMBEDDED_DIR / WIN_EXE, exe)
        shutil.rmtree(old, ignore_errors=True)
    elif frozen() and Path(sys.executable).parent.resolve() != target.resolve():
        _copy_tree(Path(sys.executable).parent, target, status)

    if opts.get("startmenu"):
        status("Adding to the Start menu")
        make_shortcut(_start_menu() / f"{APP_NAME}.lnk", exe, APP_NAME)
    if opts.get("desktop"):
        status("Creating a desktop shortcut")
        make_shortcut(_desktop_win() / f"{APP_NAME}.lnk", exe, APP_NAME)
    if opts.get("apps", True):
        status("Adding to Installed apps")
        size = sum(f.stat().st_size for f in target.rglob("*") if f.is_file()) // 1024
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, WIN_KEY) as k:
            for name, val in (("DisplayName", APP_NAME), ("DisplayVersion", APP_VERSION), ("Publisher", AUTHOR),
                              ("DisplayIcon", f'"{exe}",0'), ("InstallLocation", str(target)),
                              ("UninstallString", f'"{exe}" --uninstall-gui'), ("QuietUninstallString", f'"{exe}" --uninstall'),
                              ("URLInfoAbout", GITHUB_URL)):
                winreg.SetValueEx(k, name, 0, winreg.REG_SZ, val)
            for name, val in (("NoModify", 1), ("NoRepair", 1), ("EstimatedSize", size)):
                winreg.SetValueEx(k, name, 0, winreg.REG_DWORD, val)
    # jacestore:// links from the website open the app
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\{URL_SCHEME}") as k:
        winreg.SetValueEx(k, "", 0, winreg.REG_SZ, f"URL:{APP_NAME}")
        winreg.SetValueEx(k, "URL Protocol", 0, winreg.REG_SZ, "")
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\{URL_SCHEME}\shell\open\command") as k:
        winreg.SetValueEx(k, "", 0, winreg.REG_SZ, f'"{exe}" "%1"')
    status("Done")
    return exe


def _desktop_win() -> Path:
    import ctypes
    buf = ctypes.create_unicode_buffer(260)
    ctypes.windll.shell32.SHGetFolderPathW(None, 0x10, None, 0, buf)  # CSIDL_DESKTOPDIRECTORY
    return Path(buf.value)


def _install_mac(target: Path, opts, status) -> Path:
    src = running_package()
    if not src:
        raise RuntimeError("Not running from a packaged Jace Store.app")
    dst = target / MAC_APP
    if src.resolve() != dst.resolve():
        status(f"Copying Jace Store to {target}")
        tmp = target / f".{MAC_APP}.installing"
        shutil.rmtree(tmp, ignore_errors=True)
        subprocess.run(["ditto", str(src), str(tmp)], check=True)
        if dst.exists():
            shutil.rmtree(dst)
        tmp.rename(dst)
    if opts.get("unquarantine", True):
        subprocess.run(["xattr", "-dr", "com.apple.quarantine", str(dst)], capture_output=True)
    lsregister = ("/System/Library/Frameworks/CoreServices.framework/Frameworks/"
                  "LaunchServices.framework/Support/lsregister")
    subprocess.run([lsregister, "-f", str(dst)], capture_output=True)    # Launchpad, Spotlight, jacestore:// links
    if opts.get("dock"):
        status("Adding to the Dock")
        url = dst.as_uri().rstrip("/") + "/"
        cur = subprocess.run(["defaults", "read", "com.apple.dock", "persistent-apps"], capture_output=True, text=True).stdout
        if url not in cur and dst.name.replace(" ", "%20") not in cur:
            tile = (f"<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>{url}</string>"
                    f"<key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>")
            subprocess.run(["defaults", "write", "com.apple.dock", "persistent-apps", "-array-add", tile], capture_output=True)
            subprocess.run(["killall", "Dock"], capture_output=True)
    status("Done")
    return dst


def _linux_icon() -> Path:
    from jacestore.app_assets import asset
    d = Path(os.environ.get("XDG_DATA_HOME", HOME / ".local" / "share")) / "icons" / "hicolor" / "256x256" / "apps"
    d.mkdir(parents=True, exist_ok=True)
    out = d / f"{APP_ID}.png"
    shutil.copy2(asset("icon.png"), out)
    return out


def _desktop_entry(exe: Path) -> str:
    return "\n".join([
        "[Desktop Entry]", "Type=Application", f"Name={APP_NAME}", "GenericName=App Store",
        "Comment=Install apps and games from Jace Store, Flathub and your distro",
        f'Exec="{exe}" %U', f"Icon={APP_ID}", "Terminal=false", "Categories=System;PackageManager;",
        "Keywords=store;apps;install;software;flatpak;packages;", f"MimeType=x-scheme-handler/{URL_SCHEME};",
        f"StartupWMClass={APP_NAME}", "",
    ])


def linux_menu_entry() -> Path:
    return Path(os.environ.get("XDG_DATA_HOME", HOME / ".local" / "share")) / "applications" / f"{APP_ID}.desktop"


def linux_desktop_link() -> Path:
    return HOME / "Desktop" / f"{APP_ID}.desktop"


def _install_linux(target: Path, opts, status) -> Path:
    src = running_package()
    dst = target / LINUX_FILE
    if src and src.resolve() != dst.resolve():
        status(f"Copying Jace Store to {target}")
        tmp = dst.with_name(dst.name + ".new")
        shutil.copy2(src, tmp)
        tmp.chmod(0o755)
        os.replace(tmp, dst)
    _linux_icon()
    entry = linux_menu_entry()
    if opts.get("menu", True):
        status("Adding to the app menu")
        entry.parent.mkdir(parents=True, exist_ok=True)
        entry.write_text(_desktop_entry(dst), encoding="utf-8")
        if which("xdg-mime"):
            subprocess.run(["xdg-mime", "default", entry.name, f"x-scheme-handler/{URL_SCHEME}"], env=child_env(), capture_output=True)
        if which("update-desktop-database"):
            subprocess.run(["update-desktop-database", str(entry.parent)], env=child_env(), capture_output=True)
    if opts.get("desktop"):
        link = linux_desktop_link()
        if link.parent.is_dir():
            link.write_text(_desktop_entry(dst), encoding="utf-8")
            link.chmod(0o755)
    status("Done")
    return dst


# --- start the installed copy / clean up the download -------------------------------------------

def relaunch(target: Path, delete_after: Path | None = None):
    from jacestore.updater import clean_env
    env = clean_env()
    if sys.platform == "win32":
        subprocess.Popen([str(target)], cwd=str(target.parent), env=env, close_fds=True,
                         creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP)
        if delete_after and delete_after.resolve() != target.resolve():
            after_exit_windows(f'del /f /q "{delete_after}"')
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-n", str(target)])
        if delete_after and delete_after.suffix == ".app" and delete_after.resolve() != target.resolve() \
                and not translocated(delete_after) and not str(delete_after).startswith("/Volumes/"):
            subprocess.Popen(["/bin/sh", "-c", 'sleep 4; rm -rf "$0"', str(delete_after)], start_new_session=True)
    else:
        subprocess.Popen([str(target)], env=env, start_new_session=True)


def after_exit_windows(command: str):
    subprocess.Popen(f'cmd /c timeout /t 3 /nobreak >nul & {command}', cwd=os.environ.get("TEMP", "C:\\"),
                     creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP | NO_WINDOW, close_fds=True)


# --- uninstall ------------------------------------------------------------------------------

def uninstall(status=print):
    """Remove Jace Store itself (shortcuts now, files a moment after we quit).
    Apps it installed stay; the user removes them from the Installed page first if they want."""
    if sys.platform == "win32":
        import winreg
        from jacestore.installer import _start_menu
        for lnk in (_start_menu() / f"{APP_NAME}.lnk", _desktop_win() / f"{APP_NAME}.lnk"):
            lnk.unlink(missing_ok=True)
        for key in (WIN_KEY, rf"Software\Classes\{URL_SCHEME}\shell\open\command", rf"Software\Classes\{URL_SCHEME}\shell\open",
                    rf"Software\Classes\{URL_SCHEME}\shell", rf"Software\Classes\{URL_SCHEME}"):
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key)
            except OSError:
                pass
        d = default_dir()
        if d.exists():
            after_exit_windows(f'rmdir /s /q "{d}"')
        if is_setup_build():
            after_exit_windows(f'del /f /q "{sys.executable}"')
    elif sys.platform == "darwin":
        app = installed_path()
        cur = subprocess.run(["defaults", "export", "com.apple.dock", "-"], capture_output=True).stdout
        if cur and MAC_APP.replace(" ", "%20").encode() in cur:
            import plistlib
            prefs = plistlib.loads(cur)
            prefs["persistent-apps"] = [t for t in prefs.get("persistent-apps", [])
                                        if MAC_APP.replace(" ", "%20") not in t.get("tile-data", {}).get("file-data", {}).get("_CFURLString", "")]
            subprocess.run(["defaults", "import", "com.apple.dock", "-"], input=plistlib.dumps(prefs))
            subprocess.run(["killall", "Dock"], capture_output=True)
        if app and not translocated(app):
            subprocess.Popen(["/bin/sh", "-c", 'sleep 2; rm -rf "$0"', str(app)], start_new_session=True)
    else:
        for p in (linux_menu_entry(), linux_desktop_link(),
                  Path(os.environ.get("XDG_DATA_HOME", HOME / ".local" / "share")) / "icons" / "hicolor" / "256x256" / "apps" / f"{APP_ID}.png"):
            p.unlink(missing_ok=True)
        inst = default_dir() / LINUX_FILE
        if inst.exists():
            inst.unlink()   # safe while running: the AppImage stays mounted until we quit
    status("Jace Store was removed.")


def wait_for_pid(pid: int, timeout=60):
    if sys.platform == "win32":
        import ctypes
        h = ctypes.windll.kernel32.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE
        if h:
            ctypes.windll.kernel32.WaitForSingleObject(h, timeout * 1000)
            ctypes.windll.kernel32.CloseHandle(h)
        return
    import time
    for _ in range(timeout * 4):
        try:
            os.kill(pid, 0)
        except OSError:
            return
        time.sleep(0.25)

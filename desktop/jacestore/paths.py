"""Where Jace Store keeps its own data and the apps it installs."""
import os
import sys
from pathlib import Path

HOME = Path.home()


def data_dir() -> Path:
    if os.environ.get("JACE_STORE_HOME"):
        d = Path(os.environ["JACE_STORE_HOME"])
    elif sys.platform == "win32":
        d = Path(os.environ.get("LOCALAPPDATA", HOME / "AppData" / "Local")) / "Jace Store"
    elif sys.platform == "darwin":
        d = HOME / "Library" / "Application Support" / "Jace Store"
    else:
        d = Path(os.environ.get("XDG_DATA_HOME", HOME / ".local" / "share")) / "jace-store"
    d.mkdir(parents=True, exist_ok=True)
    return d


def cache_dir() -> Path:
    d = data_dir() / "cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


def packages_dir() -> Path:
    """Downloaded packages we keep (e.g. .msi files, needed to uninstall them later)."""
    d = data_dir() / "packages"
    d.mkdir(parents=True, exist_ok=True)
    return d


def apps_dir() -> Path:
    """Where Jace Store puts apps it installs itself (portable apps, AppImages, extracted archives)."""
    if os.environ.get("JACE_STORE_APPS"):
        d = Path(os.environ["JACE_STORE_APPS"])
    elif sys.platform == "win32":
        d = Path(os.environ.get("LOCALAPPDATA", HOME / "AppData" / "Local")) / "Programs" / "Jace Store Apps"
    elif sys.platform == "darwin":
        d = Path("/Applications") if os.access("/Applications", os.W_OK) else HOME / "Applications"
    else:
        d = HOME / "Applications"
    d.mkdir(parents=True, exist_ok=True)
    return d


def downloads_dir() -> Path:
    """The user's Downloads folder (for "download, then open" files)."""
    if sys.platform.startswith("linux"):
        try:
            import subprocess
            out = subprocess.run(["xdg-user-dir", "DOWNLOAD"], capture_output=True, text=True, timeout=5).stdout.strip()
            if out and Path(out) != HOME:
                return Path(out)
        except Exception:  # noqa: BLE001 - xdg-user-dirs isn't installed everywhere
            pass
    d = HOME / "Downloads"
    d.mkdir(parents=True, exist_ok=True)
    return d

"""Build Jace Store for the platform this runs on.

    python packaging/build.py

  Windows -> dist/JaceStore-<ver>-windows-x64.exe        (self-installing, setup wizard)
  macOS   -> dist/JaceStore-<ver>-macos-<arch>.app.zip   (unzips to Jace Store.app)
  Linux   -> use packaging/build_appimage.sh

PyInstaller can't cross-compile, so release builds run on GitHub Actions
(.github/workflows/desktop.yml).
"""
import os
import platform
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from jacestore import APP_ID, APP_NAME, APP_VERSION, URL_SCHEME  # noqa: E402

BUILD = ROOT / "build" / sys.platform
DIST = ROOT / "dist"
ASSETS = ROOT / "jacestore" / "assets"
EXCLUDE = ["PySide6.QtWebEngineCore", "PySide6.QtWebEngineWidgets", "PySide6.QtQml", "PySide6.QtQuick",
           "PySide6.Qt3DCore", "PySide6.QtMultimedia", "PySide6.QtPdf", "PySide6.QtCharts", "PySide6.QtDataVisualization",
           "tkinter"]


def run(cmd, **kw):
    print("+", " ".join(map(str, cmd)), flush=True)
    subprocess.run(list(map(str, cmd)), check=True, **kw)


def pyinstaller(name: str, icon: Path, extra=()):
    shutil.rmtree(BUILD, ignore_errors=True)
    excl = [a for m in EXCLUDE for a in ("--exclude-module", m)]
    run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--log-level", "WARN",
         "--name", name, "--windowed", "--icon", icon,
         "--distpath", BUILD / "dist", "--workpath", BUILD / "work", "--specpath", BUILD,
         "--paths", ROOT, "--add-data", f"{ASSETS}{os.pathsep}jacestore/assets",
         *excl, *extra, ROOT / "packaging" / "entry.py"])
    return BUILD / "dist"


VC_RUNTIME = ["vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll", "msvcp140_1.dll", "msvcp140_2.dll", "concrt140.dll"]


def vc_runtime_args() -> list:
    """Ship the Visual C++ runtime next to the app (fresh Windows and Wine often lack it)."""
    system32 = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32"
    args = []
    for dll in VC_RUNTIME:
        src = system32 / dll
        if not src.is_file():
            sys.exit(f"Missing {src}: install the Visual C++ 2015-2022 redistributable (x64)")
        args += ["--add-binary", f"{src}{os.pathsep}."]
    return args


def build_windows():
    """One self-installing .exe: a onefile build that also carries the small onedir
    launcher, which setup installs next to the unpacked app files."""
    vc = vc_runtime_args()
    onedir = pyinstaller("JaceStore", ASSETS / "icon.ico", vc)
    keep = ROOT / "build" / "win-launcher"
    shutil.rmtree(keep, ignore_errors=True)
    keep.mkdir(parents=True)
    shutil.copy2(onedir / "JaceStore" / "JaceStore.exe", keep / "JaceStore.exe")
    out = pyinstaller("JaceStore", ASSETS / "icon.ico",
                      [*vc, "--onefile", "--splash", ASSETS / "icon.png",
                       "--add-data", f"{keep / 'JaceStore.exe'}{os.pathsep}jace_setup"])
    DIST.mkdir(exist_ok=True)
    final = DIST / f"JaceStore-{APP_VERSION}-windows-x64.exe"
    shutil.copy2(out / "JaceStore.exe", final)
    print("Built", final)


def build_macos():
    arch = "arm64" if platform.machine() == "arm64" else "x86_64"
    out = pyinstaller(APP_NAME, ASSETS / "icon.icns", ["--osx-bundle-identifier", APP_ID, "--target-arch", arch])
    app = out / f"{APP_NAME}.app"
    info = app / "Contents" / "Info.plist"
    with open(info, "rb") as f:
        plist = plistlib.load(f)
    plist.update({
        "CFBundleDisplayName": APP_NAME,
        "CFBundleShortVersionString": APP_VERSION,
        "CFBundleVersion": APP_VERSION,
        "LSApplicationCategoryType": "public.app-category.utilities",
        "NSHighResolutionCapable": True,
        "LSMinimumSystemVersion": "12.0",
        # jacestore:// links from the website open the app
        "CFBundleURLTypes": [{"CFBundleURLName": APP_ID, "CFBundleURLSchemes": [URL_SCHEME]}],
    })
    with open(info, "wb") as f:
        plistlib.dump(plist, f)
    run(["codesign", "--force", "--deep", "--sign", "-", app])   # ad-hoc: needed to run at all on Apple Silicon
    DIST.mkdir(exist_ok=True)
    archive = DIST / f"JaceStore-{APP_VERSION}-macos-{arch}.app.zip"
    archive.unlink(missing_ok=True)
    run(["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", app, archive])
    print("Built", archive)


if __name__ == "__main__":
    if sys.platform == "win32":
        build_windows()
    elif sys.platform == "darwin":
        build_macos()
    else:
        sys.exit("On Linux, run packaging/build_appimage.sh")

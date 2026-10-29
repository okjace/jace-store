"""Updates for Jace Store itself, from GitHub Releases (tags desktop-vX.Y.Z).

  Linux    the AppImage is replaced in place, then restarted
  macOS    the new .app is unzipped and swapped in once we quit, then opened
  Windows  the new setup .exe is started with --apply-update; once we quit it copies
           itself over the installed app and starts it
"""
import os
import platform
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from jacestore import APP_VERSION, GITHUB_REPO, TAG_PREFIX, selfinstall
from jacestore.net import download, session


def current_version() -> str:
    return os.environ.get("JACE_FAKE_VERSION") or APP_VERSION


def parse_version(v: str) -> tuple:
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3])


def asset_suffix() -> str | None:
    if sys.platform == "win32":
        return "-windows-x64.exe"
    if sys.platform == "darwin":
        return f"-macos-{'arm64' if platform.machine() == 'arm64' else 'x86_64'}.app.zip"
    if sys.platform.startswith("linux"):
        return "-x86_64.AppImage"
    return None


def clean_env() -> dict:
    """Environment for starting another copy of the app without PyInstaller's variables."""
    from jacestore.system import child_env
    return child_env()


def latest_release() -> dict | None:
    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = session.get(f"https://api.github.com/repos/{GITHUB_REPO}/releases", params={"per_page": 30}, headers=headers, timeout=20)
    r.raise_for_status()
    return next((x for x in r.json() if not x.get("draft") and not x.get("prerelease") and x["tag_name"].startswith(TAG_PREFIX)), None)


def check() -> dict | None:
    """{version, notes, url, page} if a newer release exists, else None."""
    rel = latest_release()
    if not rel:
        return None
    latest = rel["tag_name"][len(TAG_PREFIX):]
    if parse_version(latest) <= parse_version(current_version()):
        return None
    suffix = asset_suffix()
    asset = next((a for a in rel.get("assets", []) if suffix and a["name"].endswith(suffix)), None)
    return {"version": latest, "notes": rel.get("body") or "", "page": rel.get("html_url", ""),
            "url": asset and asset["browser_download_url"], "size": asset and asset["size"]}


def unsupported_reason() -> str | None:
    if not selfinstall.frozen():
        return "You're running Jace Store from source. Update with  git pull."
    target = update_target()
    if not target:
        return "Install Jace Store first (finish setup), then update."
    if not os.access(target.parent, os.W_OK):
        return f"Can't write to {target.parent}."
    return None


def update_target() -> Path | None:
    t = selfinstall.installed_path() or selfinstall.running_package()
    if t and sys.platform == "darwin" and selfinstall.translocated(t):
        return None
    return t


def apply(info: dict, status=print, progress=None, relaunch=True, extra_args=()) -> None:
    """Download and stage the update. The caller must quit right afterwards."""
    reason = unsupported_reason()
    if reason:
        raise RuntimeError(reason)
    if not info.get("url"):
        raise RuntimeError("This release has no download for your computer.")
    target = update_target()
    status(f"Downloading Jace Store {info['version']}…")
    if sys.platform.startswith("linux"):
        new = target.with_name(target.name + ".new")
        download(info["url"], new, progress)
        new.chmod(0o755)
        os.replace(new, target)
        if relaunch:
            subprocess.Popen([str(target)], start_new_session=True, env=clean_env())
        return
    work = Path(tempfile.mkdtemp(prefix="jacestore-update-"))
    if sys.platform == "darwin":
        archive = download(info["url"], work / "update.app.zip", progress)
        subprocess.run(["ditto", "-x", "-k", str(archive), str(work / "new")], check=True)
        new_app = work / "new" / selfinstall.MAC_APP
        script = ('while kill -0 "$0" 2>/dev/null; do sleep 0.5; done; '
                  'rm -rf "$1.new" && ditto "$2" "$1.new" && xattr -dr com.apple.quarantine "$1.new" '
                  '&& rm -rf "$1.old" && mv "$1" "$1.old" && mv "$1.new" "$1" && rm -rf "$1.old"'
                  + ('; open "$1"' if relaunch else ''))
        subprocess.Popen(["/bin/sh", "-c", script, str(os.getpid()), str(target), str(new_app)], start_new_session=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return
    exe = download(info["url"], work / f"JaceStore-{info['version']}-setup.exe", progress)
    args = [str(exe), "--apply-update", str(target.parent), "--wait-pid", str(os.getpid()), *extra_args]
    if not relaunch:
        args.append("--no-relaunch")
    subprocess.Popen(args, creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
                     close_fds=True, cwd=str(work), env=clean_env())

"""What happens when you click Install / Update / Uninstall (no UI code here)."""
import shutil

from jacestore import installed, installer, sources, store
from jacestore.net import download, unique_path
from jacestore.paths import cache_dir, downloads_dir


def _print(*a):
    print(*a)


def install_project(slug: str, log=_print, progress=None, channel="release", file_id: str | None = None) -> dict:
    """Install (or update) a Jace Store app or game on this computer."""
    res = store.resolve(slug, channel)
    if not res:
        raise installer.InstallError("There's no download of this for your computer.")
    proj, ver = res["project"], res["version"]
    f = res["file"]
    if file_id and file_id != f["id"]:
        f = next((a for a in res.get("alternatives", []) if a["id"] == file_id), f)
    sha1 = (f.get("hashes") or {}).get("sha1")
    fmt, action = f["format"], f["action"]
    log(f"{proj['title']} {ver['version_number']}: {f['filename']} ({fmt}, {'install' if action == 'install' else 'download and open'})")

    if action == "open":
        dest = unique_path(downloads_dir(), f["filename"])
        download(f["url"], dest, progress, sha1)
        rec = installer.open_downloaded(dest, fmt, log)
    else:
        work = cache_dir() / "downloads"
        work.mkdir(parents=True, exist_ok=True)
        dest = work / f["filename"]
        download(f["url"], dest, progress, sha1)
        try:
            rec = installer.install_file(dest, fmt, slug=proj["slug"], title=proj["title"], icon_url=proj.get("icon_url"), log=log)
        finally:
            dest.unlink(missing_ok=True)

    # an update to a different kind (e.g. .exe installer -> .msi) leaves the old record behind otherwise
    old = installed.get("jacestore", proj["id"])
    if old and old.get("kind") in ("appimage", "folder", "mac_app") and old.get("paths") != rec.get("paths"):
        for p in old.get("paths", [])[1:]:   # old menu entries / shortcuts; the app folder itself may be in use
            try:
                from pathlib import Path
                if Path(p).is_file() and p not in rec.get("paths", []):
                    Path(p).unlink()
            except OSError:
                pass
    record = {
        "title": proj["title"], "slug": proj["slug"], "project_id": proj["id"], "icon_url": proj.get("icon_url"),
        "version_id": ver["id"], "version_number": ver["version_number"], "file_id": f["id"],
        "filename": f["filename"], "format": fmt, "action": action, **rec,
    }
    installed.put("jacestore", proj["id"], record)
    log("Done" if action == "install" else "Downloaded and opened. Finish in the window that opened.")
    return record


def uninstall(record: dict, log=_print):
    src = record.get("source")
    if src == "jacestore":
        installer.uninstall(record, log)
    else:
        s = sources.by_id(src)
        if not s:
            raise installer.InstallError(f"Unknown source {src}")
        s.uninstall(record["id"], log)
    installed.remove(src, record["id"])


def install_package(pkg, log=_print) -> dict:
    s = sources.by_id(pkg.source)
    log(f"Installing {pkg.name} from {s.name}")
    s.install(pkg, log)
    log("Done")
    return installed.get(pkg.source, pkg.id) or {}


def cleanup_downloads():
    shutil.rmtree(cache_dir() / "downloads", ignore_errors=True)

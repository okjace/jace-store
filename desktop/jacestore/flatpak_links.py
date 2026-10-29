"""What the Flathub website hands us when you click Install there.

flathub.org's Install button downloads a .flatpakref file ("[Flatpak Ref]" with Name=<app id>
and Url=https://dl.flathub.org/repo/), and "Open in software manager" uses appstream://<app id>.
Jace Store registers for both (and .flatpak bundles) on Linux, then opens a page for the app.
"""
import configparser
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

FLATHUB_REPO = "dl.flathub.org"


@dataclass
class FlatpakTarget:
    kind: str                     # "flathub" (install from Flathub by id) | "ref" (another remote's .flatpakref) | "bundle"
    app_id: str = ""
    title: str = ""
    path: Path | None = None      # the .flatpakref / .flatpak file
    remote_url: str = ""


def is_flatpak_arg(arg: str) -> bool:
    a = arg.lower()
    return a.startswith(("appstream:", "flatpak+https:", "flatpak:")) or a.endswith((".flatpakref", ".flatpak")) \
        or (a.startswith("file://") and a.endswith((".flatpakref", ".flatpak")))


def parse_flatpakref(text: str) -> dict:
    cp = configparser.ConfigParser(interpolation=None, strict=False)
    cp.optionxform = str
    cp.read_string(text)
    return dict(cp["Flatpak Ref"]) if cp.has_section("Flatpak Ref") else {}


def target_from_arg(arg: str) -> FlatpakTarget | None:
    """appstream://org.example.App, a .flatpakref / .flatpak path, or a file:// URL to one."""
    a = arg.strip()
    low = a.lower()
    if low.startswith("appstream:"):
        app_id = a.split(":", 1)[1].lstrip("/").split("?")[0].strip("/")
        app_id = app_id.removesuffix(".desktop")
        return FlatpakTarget("flathub", app_id=app_id) if app_id else None
    if low.startswith("flatpak+https:"):
        a = a[len("flatpak+"):]
        low = a.lower()
    if low.startswith("file://"):
        from urllib.request import url2pathname
        a = url2pathname(urlparse(a).path)     # file:///C:/x on Windows, file:///home/x elsewhere
    p = Path(a).expanduser()
    if p.suffix == ".flatpak" and p.is_file():
        return FlatpakTarget("bundle", path=p, title=p.stem)
    if p.suffix == ".flatpakref" and p.is_file():
        ref = parse_flatpakref(p.read_text(encoding="utf-8", errors="replace"))
        app_id = ref.get("Name", "")
        url = ref.get("Url", "")
        if not app_id:
            return None
        if FLATHUB_REPO in url:
            return FlatpakTarget("flathub", app_id=app_id, path=p, remote_url=url)
        return FlatpakTarget("ref", app_id=app_id, title=ref.get("Title", app_id), path=p, remote_url=url)
    return None

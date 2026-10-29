"""Other places to get software, picked by OS and distro.

  Windows  winget
  macOS    Homebrew (casks: apps)
  Linux    Flathub (any distro), Snap (if snapd is there), the distro's own packages
           (apt / dnf / zypper / pacman) and the AUR on Arch-based distros
"""
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field

from jacestore import installed
from jacestore.installer import InstallError, elevated, run
from jacestore.net import download, get_json, session
from jacestore.paths import cache_dir
from jacestore.system import brew_path, child_env, detect, terminal_command, which

NO_WINDOW = 0x08000000


@dataclass
class Package:
    source: str
    id: str
    name: str
    summary: str = ""
    version: str = ""
    icon_url: str | None = None
    homepage: str | None = None
    extra: dict = field(default_factory=dict)


def _out(cmd: list, timeout=60) -> str:
    kw = {"creationflags": NO_WINDOW} if sys.platform == "win32" else {}
    try:
        return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                              env=child_env(), timeout=timeout, **kw).stdout
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""


PAGE = 60


def _page(items: list, page: int, letter: str | None = None, key=lambda p: p.name):
    """Slice a whole catalog into pages, optionally only names starting with a letter ("#" = digits/symbols)."""
    if letter:
        L = letter.lower()
        items = [p for p in items if (key(p)[:1].lower() == L) or (L == "#" and not key(p)[:1].isalpha())]
    start = (page - 1) * PAGE
    return items[start:start + PAGE], len(items) > start + PAGE


def _rank(pkgs: list, q: str) -> list:
    ql = q.lower()

    def score(p):
        n, i = p.name.lower(), p.id.lower()
        return (0 if ql in (n, i) else 1 if n.startswith(ql) or i.startswith(ql) else 2 if ql in n or ql in i else 3, len(n))
    return sorted(pkgs, key=score)


class Source:
    id = ""
    name = ""
    blurb = ""
    #: how to set this source up when it's missing (shown instead of results)
    setup_hint = ""

    #: operating systems this source exists on
    systems = ("windows", "macos", "linux")
    #: show an A-Z index when browsing
    letters = False

    def available(self) -> bool:
        return True

    def categories(self) -> list[tuple[str, str]]:
        """(id, label) pairs to browse by; empty if this source has no categories."""
        return []

    def browse(self, page=1, category: str | None = None, letter: str | None = None) -> tuple[list["Package"], bool]:
        """A page of the source's catalog (no search words): (packages, more pages?)."""
        return [], False

    def notice(self) -> str:
        """Shown next to results / in Settings when this source needs setting up."""
        return "" if self.available() else self.setup_hint

    def search(self, q: str, limit=30) -> list[Package]:
        raise NotImplementedError

    def install(self, pkg: Package, log=print) -> dict:
        raise NotImplementedError

    def uninstall(self, pkg_id: str, log=print):
        raise NotImplementedError

    def launch_target(self, pkg: Package) -> str | None:
        return None

    def record(self, pkg: Package, rec: dict):
        installed.put(self.id, pkg.id, {"title": pkg.name, "summary": pkg.summary, "icon_url": pkg.icon_url,
                                        "version_number": pkg.version, "kind": "source", **rec})


# --- Flathub -------------------------------------------------------------------------------

class Flathub(Source):
    id, name = "flathub", "Flathub"
    systems = ("linux",)
    blurb = "Sandboxed apps that work on every Linux distro"
    setup_hint = "Install Flatpak from your distro's packages to use Flathub."

    def available(self):
        return detect().os == "linux" and bool(which("flatpak"))

    def search(self, q, limit=30):
        r = session.post("https://flathub.org/api/v2/search", json={"query": q}, timeout=20)
        r.raise_for_status()
        hits = [h for h in r.json().get("hits", []) if h.get("type", "desktop-application") in ("desktop-application", "console-application")]
        return [Package("flathub", h["app_id"], h.get("name") or h["app_id"], h.get("summary") or "", "",
                        h.get("icon"), f"https://flathub.org/apps/{h['app_id']}",
                        {"verified": h.get("verification_verified"), "installs": h.get("installs_last_month")})
                for h in hits[:limit]]

    def install(self, pkg, log=print):
        run(["flatpak", "remote-add", "--user", "--if-not-exists", "flathub", "https://dl.flathub.org/repo/flathub.flatpakrepo"], log)
        run(["flatpak", "install", "--user", "-y", "--noninteractive", "flathub", pkg.id], log)
        self.record(pkg, {"launch_kind": "flatpak", "launch": pkg.id})
        return {}

    def uninstall(self, pkg_id, log=print):
        run(["flatpak", "uninstall", "-y", "--noninteractive", pkg_id], log)

    CATEGORIES = [("", "Popular"), ("trending", "Trending"), ("recently-updated", "Recently updated"), ("AudioVideo", "Audio & Video"),
                  ("Development", "Developer tools"), ("Education", "Education"), ("Game", "Games"), ("Graphics", "Graphics & Photography"),
                  ("Network", "Networking"), ("Office", "Productivity"), ("Science", "Science"), ("System", "System"), ("Utility", "Utilities")]

    def categories(self):
        return self.CATEGORIES

    def browse(self, page=1, category=None, letter=None):
        if category in ("trending", "recently-updated"):
            url = f"https://flathub.org/api/v2/collection/{category}"
        elif category:
            url = f"https://flathub.org/api/v2/collection/category/{category}"
        else:
            url = "https://flathub.org/api/v2/collection/popular"
        d = get_json(url, params={"page": page, "per_page": PAGE})
        hits = d.get("hits", [])
        return ([Package("flathub", h["app_id"], h.get("name") or h["app_id"], h.get("summary") or "", "", h.get("icon"),
                         f"https://flathub.org/apps/{h['app_id']}", {"verified": h.get("verification_verified")})
                 for h in hits if h.get("app_id")], page < (d.get("totalPages") or 1))

    def app_info(self, app_id: str) -> dict:
        """Flathub's page data for one app (name, summary, icon, description HTML, screenshots...)."""
        return get_json(f"https://flathub.org/api/v2/appstream/{app_id}")

    def package(self, app_id: str) -> Package:
        try:
            d = self.app_info(app_id)
        except Exception:  # noqa: BLE001 - install by id even if Flathub's API is down
            d = {}
        return Package("flathub", app_id, d.get("name") or app_id, d.get("summary") or "", "",
                       d.get("icon"), f"https://flathub.org/apps/{app_id}", {"info": d})


class FlatpakFile(Source):
    """A .flatpakref from a remote other than Flathub, or a .flatpak bundle (opened from a website)."""
    id, name = "flatpak", "Flatpak"
    systems = ("linux",)
    blurb = "Flatpak apps opened from a .flatpakref or .flatpak file"

    def available(self):
        return detect().os == "linux" and bool(which("flatpak"))

    def search(self, q, limit=30):
        return []

    def install(self, pkg, log=print):
        before = _flatpak_apps()
        kind = "--bundle" if pkg.extra.get("bundle") else "--from"
        run(["flatpak", "install", "--user", "-y", "--noninteractive", kind, pkg.extra["path"]], log)
        new = sorted(_flatpak_apps() - before)
        app_id = new[0] if new else pkg.id
        pkg = Package(pkg.source, app_id, pkg.name, pkg.summary, pkg.version, pkg.icon_url, pkg.homepage, pkg.extra)
        self.record(pkg, {"launch_kind": "flatpak", "launch": app_id})
        return {"id": app_id}

    def uninstall(self, pkg_id, log=print):
        run(["flatpak", "uninstall", "-y", "--noninteractive", pkg_id], log)


def _flatpak_apps() -> set:
    out = _out(["flatpak", "list", "--app", "--columns=application"])
    return {line.strip() for line in out.splitlines() if line.strip()}


# --- Snap ----------------------------------------------------------------------------------

class Snap(Source):
    id, name = "snap", "Snap Store"
    systems = ("linux",)
    blurb = "Canonical's app store"

    def available(self):
        return detect().os == "linux" and bool(which("snap"))

    def search(self, q, limit=30):
        return self._parse(_out(["snap", "find", q]), limit)

    def _parse(self, text, limit):
        lines = text.splitlines()
        if not lines or not lines[0].startswith("Name"):
            return []
        head = lines[0]
        cols = [head.index(c) for c in ("Name", "Version", "Publisher", "Notes", "Summary")]
        out = []
        for line in lines[1:limit + 1]:
            cut = lambda a, b=None: line[a:b].strip()  # noqa: E731
            out.append(Package("snap", cut(cols[0], cols[1]), cut(cols[0], cols[1]), cut(cols[4]), cut(cols[1], cols[2]),
                               None, f"https://snapcraft.io/{cut(cols[0], cols[1])}"))
        return out

    SECTIONS = ["featured", "games", "productivity", "development", "entertainment", "art-and-design", "photo-and-video",
                "music-and-audio", "social", "utilities", "education", "science", "security", "server-and-cloud", "devices-and-iot"]

    def categories(self):
        return [(s, s.replace("-and-", " & ").replace("-", " ").capitalize()) for s in self.SECTIONS]

    def browse(self, page=1, category=None, letter=None):
        if page > 1:
            return [], False
        return self._parse(_out(["snap", "find", f"--section={category or 'featured'}"]), 200), False

    def install(self, pkg, log=print):
        run(elevated(["snap", "install", pkg.id]), log)
        self.record(pkg, {"launch_kind": "snap", "launch": pkg.id})
        return {}

    def uninstall(self, pkg_id, log=print):
        run(elevated(["snap", "remove", pkg_id]), log)


# --- the distro's own packages -------------------------------------------------------------------

class Distro(Source):
    id = "distro"
    systems = ("linux",)

    @property
    def name(self):
        s = detect()
        return f"{(s.distro or 'Linux').split(' (')[0]} packages"

    blurb = "Your distro's own software repositories"

    def available(self):
        s = detect()
        return s.os == "linux" and s.package_manager is not None and not s.immutable

    def search(self, q, limit=40):
        pm = detect().package_manager
        pkgs = []
        if pm == "apt":
            for line in _out(["apt-cache", "search", "--names-only", q]).splitlines():
                name, _, desc = line.partition(" - ")
                if name:
                    pkgs.append(Package("distro", name.strip(), name.strip(), desc.strip()))
        elif pm == "dnf":
            for line in _out(["dnf", "search", "-q", q], timeout=120).splitlines():
                m = re.match(r"^\s*([\w.+-]+?)\.(?:x86_64|aarch64|noarch|i686)\s*(?::|\t)\s*(.*)$", line)
                if m:
                    pkgs.append(Package("distro", m.group(1), m.group(1), m.group(2).strip()))
        elif pm == "zypper":
            for line in _out(["zypper", "--non-interactive", "--quiet", "search", q]).splitlines():
                parts = [p.strip() for p in line.split("|")]
                if len(parts) >= 4 and parts[-1] == "package":
                    pkgs.append(Package("distro", parts[1], parts[1], parts[2]))
        elif pm == "pacman":
            lines = _out(["pacman", "-Ss", q]).splitlines()
            for head, desc in zip(lines[::2], lines[1::2]):
                m = re.match(r"^(\S+)/(\S+)\s+(\S+)", head)
                if m:
                    pkgs.append(Package("distro", m.group(2), m.group(2), desc.strip(), m.group(3), extra={"repo": m.group(1)}))
        return _rank(pkgs, q)[:limit]

    letters = True
    _all: list | None = None

    def browse(self, page=1, category=None, letter=None):
        if self._all is None:
            pm = detect().package_manager
            names = []
            if pm == "apt":
                names = [(n, "") for n in _out(["apt-cache", "pkgnames"], 120).split()]
            elif pm == "pacman":
                for line in _out(["pacman", "-Sl"], 120).splitlines():
                    parts = line.split()
                    if len(parts) >= 3:
                        names.append((parts[1], parts[2]))
            elif pm == "dnf":
                for line in _out(["dnf", "list", "--available", "-q"], 300).splitlines():
                    parts = line.split()
                    if len(parts) >= 2 and "." in parts[0]:
                        names.append((parts[0].rsplit(".", 1)[0], parts[1]))
            elif pm == "zypper":
                for line in _out(["zypper", "--non-interactive", "--quiet", "search", "-t", "package"], 300).splitlines():
                    cols = [c.strip() for c in line.split("|")]
                    if len(cols) >= 3 and cols[1] and cols[1] != "Name":
                        names.append((cols[1], ""))
            seen = {}
            for n, v in names:
                seen.setdefault(n, v)
            self._all = [Package("distro", n, n, "", v) for n, v in sorted(seen.items())]
        return _page(self._all, page, letter)

    def install(self, pkg, log=print):
        pm = detect().package_manager
        cmd = {"apt": ["env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "install", "-y", pkg.id],
               "dnf": ["dnf", "install", "-y", pkg.id],
               "zypper": ["zypper", "--non-interactive", "install", pkg.id],
               "pacman": ["pacman", "-S", "--needed", "--noconfirm", pkg.id]}[pm]
        log("Asking for your password to install a system package…")
        run(elevated(cmd), log)
        self.record(pkg, {"manager": pm})
        return {}

    def uninstall(self, pkg_id, log=print):
        pm = detect().package_manager
        cmd = {"apt": ["apt-get", "remove", "-y", pkg_id], "dnf": ["dnf", "remove", "-y", pkg_id],
               "zypper": ["zypper", "--non-interactive", "remove", pkg_id], "pacman": ["pacman", "-R", "--noconfirm", pkg_id]}[pm]
        run(elevated(cmd), log)


# --- AUR (Arch-based distros) ----------------------------------------------------------------------

class AUR(Source):
    id, name = "aur", "AUR"
    systems = ("linux",)
    blurb = "Community packages for Arch-based distros (built on your computer)"

    def available(self):
        return detect().os == "linux" and detect().family == "arch"

    setup_hint = "Install yay or paru to install AUR packages from here."

    def notice(self):
        return "" if detect().aur_helper else self.setup_hint

    def search(self, q, limit=30):
        if len(q) < 2:
            return []
        d = get_json(f"https://aur.archlinux.org/rpc/v5/search/{q}", params={"by": "name-desc"})
        res = sorted(d.get("results", []), key=lambda r: -(r.get("Popularity") or 0))
        return _rank([Package("aur", r["Name"], r["Name"], r.get("Description") or "", r.get("Version", ""),
                              None, f"https://aur.archlinux.org/packages/{r['Name']}",
                              {"votes": r.get("NumVotes"), "out_of_date": bool(r.get("OutOfDate"))}) for r in res], q)[:limit]

    letters = True

    def browse(self, page=1, category=None, letter=None):
        import gzip
        f = cache_dir() / "aur-packages.txt"
        if not f.exists() or time.time() - f.stat().st_mtime > 86400:
            gz = cache_dir() / "aur-packages.gz"
            download("https://aur.archlinux.org/packages.gz", gz)
            f.write_bytes(gzip.decompress(gz.read_bytes()))
            gz.unlink(missing_ok=True)
        names = sorted(n.strip() for n in f.read_text(encoding="utf-8", errors="replace").splitlines() if n.strip() and not n.startswith("#"))
        items, more = _page([Package("aur", n, n, "", "", None, f"https://aur.archlinux.org/packages/{n}") for n in names], page, letter)
        return items, more

    def install(self, pkg, log=print):
        helper = detect().aur_helper
        if not helper:
            raise InstallError("Install yay or paru first (AUR packages are built on your computer).")
        # AUR builds can ask questions (PKGBUILD review, dependencies), so they run in a terminal window
        term = terminal_command([helper, "-S", pkg.id])
        if not term:
            raise InstallError(f"Couldn't find a terminal. Run:  {helper} -S {pkg.id}")
        log(f"Opening a terminal to build and install {pkg.id} with {helper}…")
        subprocess.Popen(term, env=child_env(), start_new_session=True)
        self.record(pkg, {"manager": "aur", "pending": True})
        return {"opened_terminal": True}

    def uninstall(self, pkg_id, log=print):
        run(elevated(["pacman", "-R", "--noconfirm", pkg_id]), log)


# --- winget (Windows) -----------------------------------------------------------------------------------

def _table(text: str) -> list[dict]:
    """Parse winget's fixed-width table (header line, then a ----- line, then rows)."""
    lines = [ln.rstrip() for ln in text.splitlines()]
    for i, ln in enumerate(lines):
        if i and set(ln.strip()) == {"-"} and len(ln.strip()) > 10:
            head = lines[i - 1]
            # spinner characters can come before the header on the same line
            head = head[max(0, head.find("Name")):] if "Name" in head else head
            names = head.split()
            starts = [head.index(n) for n in names]
            rows = []
            for row in lines[i + 1:]:
                if not row.strip():
                    continue
                vals = [row[s:(starts[j + 1] if j + 1 < len(starts) else None)].strip() for j, s in enumerate(starts)]
                rows.append(dict(zip(names, vals)))
            return rows
    return []


class Winget(Source):
    id, name = "winget", "winget"
    systems = ("windows",)
    blurb = "Microsoft's Windows Package Manager"
    setup_hint = "winget comes with Windows 10/11 (App Installer). Update App Installer from the Microsoft Store to get it."
    FLAGS = ["--accept-source-agreements", "--disable-interactivity"]

    def available(self):
        return detect().os == "windows" and bool(which("winget"))

    def search(self, q, limit=30):
        rows = _table(_out(["winget", "search", "--query", q, *self.FLAGS], timeout=90))
        return [Package("winget", r.get("Id", ""), r.get("Name", ""), f"from {r.get('Source') or 'winget'}", r.get("Version", ""))
                for r in rows[:limit] if r.get("Id")]

    TAGS = ["browser", "productivity", "developer-tools", "editor", "games", "chat", "music", "video", "photo", "office",
            "security", "utility", "terminal", "vpn", "drawing", "3d"]

    def categories(self):
        return [(t, t.replace("-", " ").capitalize()) for t in self.TAGS]

    def browse(self, page=1, category=None, letter=None):
        if page > 1:
            return [], False
        rows = _table(_out(["winget", "search", "--tag", category or "productivity", *self.FLAGS], timeout=90))
        return [Package("winget", r.get("Id", ""), r.get("Name", ""), "", r.get("Version", "")) for r in rows if r.get("Id")], False

    def install(self, pkg, log=print):
        run(["winget", "install", "--id", pkg.id, "-e", "--silent", "--accept-package-agreements", *self.FLAGS], log)
        self.record(pkg, {})
        return {}

    def uninstall(self, pkg_id, log=print):
        run(["winget", "uninstall", "--id", pkg_id, "-e", "--silent", *self.FLAGS], log)


# --- Homebrew (macOS) -------------------------------------------------------------------------------------

class Homebrew(Source):
    id, name = "brew", "Homebrew"
    systems = ("macos",)
    blurb = "Mac apps (casks) from Homebrew"
    setup_hint = "Install Homebrew from brew.sh to get thousands more Mac apps here."
    CASKS = "https://formulae.brew.sh/api/cask.json"

    def available(self):
        return detect().os == "macos" and bool(brew_path())

    def _casks(self) -> list:
        f = cache_dir() / "brew-casks.json"
        if not f.exists() or time.time() - f.stat().st_mtime > 7 * 86400:
            download(self.CASKS, f)
        return json.loads(f.read_text(encoding="utf-8"))

    def search(self, q, limit=30):
        ql = q.lower()
        hits = []
        for c in self._casks():
            names = c.get("name") or [c["token"]]
            hay = " ".join([c["token"], *names, c.get("desc") or ""]).lower()
            if ql in hay:
                hits.append(Package("brew", c["token"], names[0], c.get("desc") or "", str(c.get("version", "")),
                                    None, c.get("homepage")))
        return _rank(hits, q)[:limit]

    letters = True

    def browse(self, page=1, category=None, letter=None):
        items = [Package("brew", c["token"], (c.get("name") or [c["token"]])[0], c.get("desc") or "", str(c.get("version", "")), None, c.get("homepage"))
                 for c in self._casks()]
        return _page(sorted(items, key=lambda p: p.name.lower()), page, letter)

    def install(self, pkg, log=print):
        run([brew_path(), "install", "--cask", pkg.id], log)
        self.record(pkg, {})
        return {}

    def uninstall(self, pkg_id, log=print):
        run([brew_path(), "uninstall", "--cask", pkg_id], log)


# --- AppImageHub (Linux) -------------------------------------------------------------------------------

class AppImageHub(Source):
    """appimage.github.io's catalog: AppImages released on GitHub (we fetch the newest release)."""
    id, name = "appimagehub", "AppImageHub"
    systems = ("linux",)
    blurb = "Portable AppImage apps from GitHub releases"
    letters = True
    FEED = "https://appimage.github.io/feed.json"
    MEDIA = "https://appimage.github.io/database/"
    CATS = [("AudioVideo", "Audio & Video"), ("Development", "Developer tools"), ("Education", "Education"), ("Game", "Games"),
            ("Graphics", "Graphics"), ("Network", "Internet"), ("Office", "Office"), ("Science", "Science"), ("System", "System"),
            ("Utility", "Utilities")]

    def _items(self) -> list:
        f = cache_dir() / "appimagehub.json"
        if not f.exists() or time.time() - f.stat().st_mtime > 86400:
            download(self.FEED, f)
        out = []
        for it in json.loads(f.read_text(encoding="utf-8")).get("items", []):
            gh = next((lk["url"] for lk in it.get("links") or [] if lk.get("type") == "GitHub"), None)
            if not gh:
                continue                                  # only GitHub releases can be installed automatically
            icons = it.get("icons") or []
            out.append(Package("appimagehub", it["name"], it["name"].replace("_", " "), it.get("description") or "", "",
                               self.MEDIA + icons[0] if icons else None, f"https://github.com/{gh}",
                               {"github": gh, "categories": it.get("categories") or []}))
        return sorted(out, key=lambda p: p.name.lower())

    def categories(self):
        return self.CATS

    def search(self, q, limit=40):
        ql = q.lower()
        return _rank([p for p in self._items() if ql in p.name.lower() or ql in p.summary.lower()], q)[:limit]

    def browse(self, page=1, category=None, letter=None):
        items = self._items()
        if category:
            items = [p for p in items if category in p.extra.get("categories", [])]
        return _page(items, page, letter)

    def install(self, pkg, log=print):
        from jacestore import installer
        arch = "aarch64" if detect().arch == "arm64" else "x86_64"
        rel = get_json(f"https://api.github.com/repos/{pkg.extra['github']}/releases/latest")
        assets = [a for a in rel.get("assets", []) if a["name"].lower().endswith(".appimage")]
        pick = next((a for a in assets if arch in a["name"].lower() or (arch == "x86_64" and "amd64" in a["name"].lower())), None) \
            or next((a for a in assets if not any(x in a["name"].lower() for x in ("aarch64", "arm64", "armhf", "i386", "i686"))), None)
        if not pick:
            raise InstallError(f"{pkg.name}'s newest GitHub release ({rel.get('tag_name', '?')}) has no AppImage for your computer.")
        log(f"{pkg.name} {rel.get('tag_name', '')}: {pick['name']}")
        dest = cache_dir() / "downloads" / pick["name"]
        download(pick["browser_download_url"], dest)
        rec = installer.install_file(dest, "appimage", slug=f"appimagehub-{pkg.id}", title=pkg.name, icon_url=pkg.icon_url, log=log)
        self.record(Package(pkg.source, pkg.id, pkg.name, pkg.summary, rel.get("tag_name", ""), pkg.icon_url, pkg.homepage, pkg.extra),
                    {"app_kind": "appimage", "paths": rec.get("paths", []), "launch": rec.get("launch"), "desktop_file": rec.get("desktop_file")})
        return {}

    def uninstall(self, pkg_id, log=print):
        from jacestore import installer
        rec = installed.get(self.id, pkg_id) or {}
        installer.uninstall({**rec, "kind": "appimage"}, log)


# --- package managers described by their commands (built in, and the user's own) -----------------------------

def _fill(cmd, **values) -> list:
    """'pkg install {id}' -> ['pkg', 'install', 'the-id'] (no shell; placeholders only inside arguments)."""
    import shlex
    if isinstance(cmd, list):
        parts = list(cmd)
    elif sys.platform == "win32":
        # Windows paths have backslashes, so split the Windows way, then drop the quotes around arguments
        parts = [p[1:-1] if len(p) >= 2 and p[0] == p[-1] == '"' else p for p in shlex.split(cmd, posix=False)]
    else:
        parts = shlex.split(cmd)
    return [p.replace("{query}", values.get("query", "")).replace("{id}", values.get("id", "")) for p in parts]


class CommandSource(Source):
    """A package manager driven through its command line. `spec` keys:
      id, name, blurb, systems, program (to check it's installed), search, parse ("regex" | "table" |
      "lines" | "npm" | "nix" | "pypi"), regex (named groups id / name / version / summary), install,
      uninstall, browse (optional: lists everything), root (needs administrator), terminal (run in a window).
    Commands use {query} and {id}."""

    def __init__(self, spec: dict, custom=False):
        self.spec = spec
        self.custom = custom
        self.id = spec["id"]
        self.name = spec["name"]
        self.blurb = spec.get("blurb", "")
        self.systems = tuple(spec.get("systems") or ("windows", "macos", "linux"))
        self.letters = bool(spec.get("browse"))
        prog = spec.get("program", "")
        self.setup_hint = spec.get("setup_hint") or (f"Not on this computer ({os.path.basename(prog)} wasn't found)" if prog else "")

    def _program(self):
        prog = self.spec.get("program")
        if not prog:
            return None
        if os.path.isabs(prog):
            return prog if os.access(prog, os.X_OK) else None
        return which(prog)

    def available(self):
        return detect().os in self.systems and bool(self._program())

    def _cmd(self, key, **values):
        cmd = _fill(self.spec[key], **values)
        prog = self._program()
        if prog and cmd and cmd[0] == self.spec.get("program"):
            cmd[0] = prog                                     # full path (Windows .cmd shims)
        return cmd

    def _parse(self, text: str, limit=60) -> list:
        mode = self.spec.get("parse", "regex")
        out = []
        if mode == "npm":
            try:
                for x in json.loads(text or "[]"):
                    out.append(Package(self.id, x["name"], x["name"], x.get("description") or "", x.get("version") or "", None,
                                       (x.get("links") or {}).get("npm")))
            except ValueError:
                pass
        elif mode == "nix":
            try:
                for k, v in json.loads(text or "{}").items():
                    name = v.get("pname") or k.rsplit(".", 1)[-1]
                    out.append(Package(self.id, k.split(".", 2)[-1], name, v.get("description") or "", v.get("version") or ""))
            except ValueError:
                pass
        elif mode == "table":
            for r in _table(text):
                vals = list(r.values())
                if vals and vals[0]:
                    out.append(Package(self.id, r.get("Id") or r.get("Name") or vals[0], r.get("Name") or vals[0], r.get("Source", ""), r.get("Version", "")))
        elif mode == "lines":
            out = [Package(self.id, ln.strip(), ln.strip()) for ln in text.splitlines() if ln.strip() and not ln.startswith(("=", "-"))]
        else:
            rx = re.compile(self.spec.get("regex") or r"^(?P<id>\S+)\s*(?P<summary>.*)$")
            for line in text.splitlines():
                m = rx.match(line.rstrip())
                if m:
                    g = m.groupdict()
                    if g.get("id"):
                        out.append(Package(self.id, g["id"], g.get("name") or g["id"], (g.get("summary") or "").strip(), g.get("version") or ""))
        return out[:limit]

    def search(self, q, limit=60):
        if self.spec.get("parse") == "pypi":
            try:
                d = get_json(f"https://pypi.org/pypi/{q.strip()}/json")["info"]
                return [Package(self.id, d["name"], d["name"], d.get("summary") or "", d.get("version") or "", None, d.get("package_url"))]
            except Exception:  # noqa: BLE001 - PyPI only knows exact names
                return []
        if not self.spec.get("search"):
            return []
        return _rank(self._parse(_out(self._cmd("search", query=q), 120), 200), q)[:limit]

    def browse(self, page=1, category=None, letter=None):
        if not self.spec.get("browse"):
            return [], False
        items = sorted(self._parse(_out(self._cmd("browse"), 300), 100000), key=lambda p: p.name.lower())
        return _page(items, page, letter)

    def _run(self, key, pkg_id, log):
        cmd = self._cmd(key, id=pkg_id)
        if self.spec.get("terminal"):
            if detect().os != "linux":
                raise InstallError("Running in a terminal window is only supported on Linux.")
            term = terminal_command(elevated(cmd) if self.spec.get("root") else cmd)
            if not term:
                raise InstallError("Couldn't find a terminal. Run:  " + " ".join(cmd))
            subprocess.Popen(term, env=child_env(), start_new_session=True)
            log("Opened a terminal to finish it")
            return
        if self.spec.get("root"):
            cmd = admin_command(cmd)
        run(cmd, log)

    def install(self, pkg, log=print):
        self._run("install", pkg.id, log)
        self.record(pkg, {"manager": self.id, **({"pending": True} if self.spec.get("terminal") else {})})
        return {}

    def uninstall(self, pkg_id, log=print):
        if not self.spec.get("uninstall"):
            raise InstallError(f"{self.name} has no uninstall command set up.")
        self._run("uninstall", pkg_id, log)


def admin_command(cmd: list) -> list:
    """Run a command as administrator: pkexec on Linux, the Mac password prompt, or Windows UAC."""
    s = detect().os
    if s == "linux":
        return elevated(cmd)
    if s == "macos":
        import shlex
        script = " ".join(shlex.quote(c) for c in cmd)
        return ["osascript", "-e", 'do shell script "' + script.replace("\\", "\\\\").replace('"', '\\"') + '" with administrator privileges']
    q = lambda x: "'" + x.replace("'", "''") + "'"  # noqa: E731 - PowerShell single quotes
    args = ",".join(q(a) for a in cmd[1:]) or "''"
    return ["powershell", "-NoProfile", "-Command",
            f"$p = Start-Process -FilePath {q(cmd[0])} -ArgumentList {args} -Verb RunAs -Wait -PassThru; exit $p.ExitCode"]


BUILTIN_SPECS = [
    {"id": "choco", "name": "Chocolatey", "systems": ["windows"], "program": "choco", "blurb": "Community Windows packages",
     "search": "choco search {query} --limit-output", "regex": r"^(?P<id>[^|\s]+)\|(?P<version>\S+)$",
     "install": "choco install {id} -y", "uninstall": "choco uninstall {id} -y", "root": True},
    {"id": "scoop", "name": "Scoop", "systems": ["windows"], "program": "scoop", "blurb": "Portable apps, no administrator needed",
     "search": "scoop search {query}", "parse": "table", "install": "scoop install {id}", "uninstall": "scoop uninstall {id}"},
    {"id": "macports", "name": "MacPorts", "systems": ["macos"], "program": "/opt/local/bin/port", "blurb": "Open-source software for macOS",
     "search": "/opt/local/bin/port search --line {query}", "regex": r"^(?P<id>\S+)\s+(?P<version>\S+)\s+\S+\s+(?P<summary>.*)$",
     "install": "/opt/local/bin/port install {id}", "uninstall": "/opt/local/bin/port uninstall {id}", "root": True},
    {"id": "mas", "name": "Mac App Store", "systems": ["macos"], "program": "mas", "blurb": "Apps from the Mac App Store (through mas)",
     "setup_hint": "Install mas (brew install mas) and sign in to the App Store to use it.",
     "search": "mas search {query}", "regex": r"^\s*(?P<id>\d+)\s+(?P<name>.+?)\s+\((?P<version>[^)]*)\)\s*$",
     "install": "mas install {id}", "uninstall": "mas uninstall {id}", "root": True},
    {"id": "brew-formula", "name": "Homebrew (command-line tools)", "systems": ["macos", "linux"], "program": "brew",
     "blurb": "Homebrew formulae", "search": "brew search --formula {query}", "parse": "lines",
     "install": "brew install {id}", "uninstall": "brew uninstall {id}"},
    {"id": "nix", "name": "Nix", "systems": ["linux", "macos"], "program": "nix", "blurb": "nixpkgs, the biggest package collection",
     "search": ["nix", "--extra-experimental-features", "nix-command flakes", "search", "nixpkgs", "{query}", "--json"], "parse": "nix",
     "install": ["nix", "--extra-experimental-features", "nix-command flakes", "profile", "install", "nixpkgs#{id}"],
     "uninstall": ["nix", "--extra-experimental-features", "nix-command flakes", "profile", "remove", "{id}"]},
    {"id": "xbps", "name": "Void packages (xbps)", "systems": ["linux"], "program": "xbps-install", "blurb": "Void Linux's repositories",
     "search": "xbps-query -Rs {query}", "regex": r"^\[.\]\s+(?P<id>\S+?)-(?P<version>[^-\s]+_\d+)\s+(?P<summary>.*)$",
     "install": "xbps-install -y {id}", "uninstall": "xbps-remove -y {id}", "root": True},
    {"id": "apk", "name": "Alpine packages (apk)", "systems": ["linux"], "program": "apk", "blurb": "Alpine Linux's repositories",
     "search": "apk search -v -d {query}", "regex": r"^(?P<id>.+?)-(?P<version>\d[^-\s]*-r\d+)\s+-\s+(?P<summary>.*)$",
     "install": "apk add {id}", "uninstall": "apk del {id}", "root": True},
    {"id": "eopkg", "name": "Solus packages (eopkg)", "systems": ["linux"], "program": "eopkg", "blurb": "Solus's repositories",
     "search": "eopkg search {query}", "regex": r"^(?P<id>\S+)\s+-\s+(?P<summary>.*)$",
     "install": "eopkg install -y {id}", "uninstall": "eopkg remove -y {id}", "root": True},
    {"id": "cargo", "name": "Cargo (Rust)", "program": "cargo", "blurb": "Rust programs from crates.io",
     "search": "cargo search {query} --limit 40", "regex": r'^(?P<id>[\w-]+)\s*=\s*"(?P<version>[^"]+)"\s*(?:#\s*(?P<summary>.*))?$',
     "install": "cargo install {id}", "uninstall": "cargo uninstall {id}"},
    {"id": "npm", "name": "npm (Node.js)", "program": "npm", "blurb": "Command-line tools from npm",
     "search": "npm search --json --searchlimit 40 {query}", "parse": "npm",
     "install": "npm install -g {id}", "uninstall": "npm uninstall -g {id}"},
    {"id": "pipx", "name": "pipx (Python)", "program": "pipx", "blurb": "Python apps from PyPI (type the exact name)",
     "search": "", "parse": "pypi", "install": "pipx install {id}", "uninstall": "pipx uninstall {id}"},
]


# --- web search ------------------------------------------------------------------------------------------------

INSTALLABLE_EXT = (".exe", ".msi", ".msix", ".dmg", ".pkg", ".deb", ".rpm", ".appimage", ".flatpakref", ".flatpak",
                   ".snap", ".zip", ".tar.gz", ".tar.xz", ".7z", ".pkg.tar.zst")


class WebSearch(Source):
    """Search the internet (DuckDuckGo) for an app's website or download."""
    id, name = "web", "Web"
    blurb = "Search the internet for an app's website or download"

    def search(self, q, limit=25):
        import html as H
        from urllib.parse import parse_qs, unquote, urlparse
        r = session.post("https://html.duckduckgo.com/html/", data={"q": q}, timeout=20)
        r.raise_for_status()
        out = []
        for b in re.split(r'<div class="result results_links', r.text)[1:]:
            m = re.search(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', b, re.S)
            if not m:
                continue
            href = H.unescape(m.group(1))
            if "duckduckgo.com/l/" in href:
                href = unquote(parse_qs(urlparse(href if href.startswith("http") else "https:" + href).query).get("uddg", [href])[0])
            if "duckduckgo.com/y.js" in href or not href.startswith("http"):
                continue                                          # ads
            title = H.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
            sm = re.search(r'class="result__snippet"[^>]*>(.*?)</a>', b, re.S)
            snippet = H.unescape(re.sub(r"<[^>]+>", "", sm.group(1))).strip() if sm else ""
            direct = urlparse(href).path.lower().endswith(INSTALLABLE_EXT)
            out.append(Package("web", href, title or href, snippet, "", None, href, {"direct": direct, "host": urlparse(href).netloc}))
            if len(out) >= limit:
                break
        return out

    def install(self, pkg, log=print):
        """A direct download link: download it, then install it (or open it) the way Jace Store would."""
        from urllib.parse import unquote, urlparse
        from jacestore import installer
        from jacestore.formats import action_for, format_of
        from jacestore.net import unique_path
        from jacestore.paths import downloads_dir
        name = unquote(urlparse(pkg.id).path.rsplit("/", 1)[-1]) or "download"
        fmt = format_of(name)
        act = action_for(fmt)
        dest = (cache_dir() / "downloads" / name) if act == "install" else unique_path(downloads_dir(), name)
        log(f"Downloading {name} from {urlparse(pkg.id).netloc}")
        download(pkg.id, dest)
        if act == "install":
            try:
                rec = installer.install_file(dest, fmt, slug=f"web-{name}", title=name.split(".")[0], log=log)
            finally:
                dest.unlink(missing_ok=True)
        else:
            rec = installer.open_downloaded(dest, fmt, log)
        self.record(pkg, {**rec, "app_kind": rec.get("kind")})
        return rec

    def uninstall(self, pkg_id, log=print):
        from jacestore import installer
        rec = installed.get(self.id, pkg_id) or {}
        installer.uninstall({**rec, "kind": rec.get("app_kind")}, log)


# --- registry ----------------------------------------------------------------------------------------------------

FLATHUB = Flathub()
FLATPAK_FILE = FlatpakFile()
WEB = WebSearch()
BUILTIN = [Winget(), *[CommandSource(s) for s in BUILTIN_SPECS[:2]], Homebrew(), *[CommandSource(s) for s in BUILTIN_SPECS[2:4]],
           Distro(), FLATHUB, Snap(), AUR(), AppImageHub(), *[CommandSource(s) for s in BUILTIN_SPECS[4:]]]
ALL = BUILTIN       # (older name)


def custom_sources() -> list:
    from jacestore import settings
    out = []
    for spec in settings.load().get("custom_sources", []):
        try:
            sid = "custom-" + re.sub(r"[^a-z0-9]+", "-", spec["name"].lower()).strip("-")
            out.append(CommandSource({**spec, "id": sid}, custom=True))
        except (KeyError, AttributeError):
            continue
    return out


def all_sources() -> list:
    """Every source that exists on this kind of computer (installed or not), plus the user's own."""
    return [s for s in [*BUILTIN, *custom_sources()] if detect().os in s.systems]


def for_this_computer() -> list:
    """Sources to show: the ones that work here and aren't turned off (Flathub always on Linux, with its setup hint)."""
    from jacestore import settings
    off = set(settings.load().get("disabled_sources", []))
    out = [s for s in all_sources() if s.id not in off and s.available()]
    if detect().os == "linux" and FLATHUB not in out and "flathub" not in off:
        out.insert(min(1, len(out)), FLATHUB)
    return [*out, WEB]


def by_id(sid: str):
    return next((s for s in [*BUILTIN, *custom_sources(), FLATPAK_FILE, WEB] if s.id == sid), None)

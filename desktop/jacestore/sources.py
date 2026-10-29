"""Other places to get software, picked by OS and distro.

  Windows  winget
  macOS    Homebrew (casks: apps)
  Linux    Flathub (any distro), Snap (if snapd is there), the distro's own packages
           (apt / dnf / zypper / pacman) and the AUR on Arch-based distros
"""
import json
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

    def available(self) -> bool:
        return True

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
    blurb = "Canonical's app store"

    def available(self):
        return detect().os == "linux" and bool(which("snap"))

    def search(self, q, limit=30):
        lines = _out(["snap", "find", q]).splitlines()
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

    def install(self, pkg, log=print):
        run(elevated(["snap", "install", pkg.id]), log)
        self.record(pkg, {"launch_kind": "snap", "launch": pkg.id})
        return {}

    def uninstall(self, pkg_id, log=print):
        run(elevated(["snap", "remove", pkg_id]), log)


# --- the distro's own packages -------------------------------------------------------------------

class Distro(Source):
    id = "distro"

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
    blurb = "Microsoft's Windows Package Manager"
    setup_hint = "winget comes with Windows 10/11 (App Installer). Update App Installer from the Microsoft Store to get it."
    FLAGS = ["--accept-source-agreements", "--disable-interactivity"]

    def available(self):
        return detect().os == "windows" and bool(which("winget"))

    def search(self, q, limit=30):
        rows = _table(_out(["winget", "search", "--query", q, *self.FLAGS], timeout=90))
        return [Package("winget", r.get("Id", ""), r.get("Name", ""), r.get("Source", ""), r.get("Version", ""))
                for r in rows[:limit] if r.get("Id")]

    def install(self, pkg, log=print):
        run(["winget", "install", "--id", pkg.id, "-e", "--silent", "--accept-package-agreements", *self.FLAGS], log)
        self.record(pkg, {})
        return {}

    def uninstall(self, pkg_id, log=print):
        run(["winget", "uninstall", "--id", pkg_id, "-e", "--silent", *self.FLAGS], log)


# --- Homebrew (macOS) -------------------------------------------------------------------------------------

class Homebrew(Source):
    id, name = "brew", "Homebrew"
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

    def install(self, pkg, log=print):
        run([brew_path(), "install", "--cask", pkg.id], log)
        self.record(pkg, {})
        return {}

    def uninstall(self, pkg_id, log=print):
        run([brew_path(), "uninstall", "--cask", pkg_id], log)


ALL = [Winget(), Homebrew(), Distro(), Flathub(), Snap(), AUR()]
FLATPAK_FILE = FlatpakFile()


def for_this_computer() -> list[Source]:
    """Sources that make sense here (including ones that need setting up first)."""
    s = detect()
    if s.os == "windows":
        return [ALL[0]]
    if s.os == "macos":
        return [ALL[1]]
    out = [src for src in (ALL[2], ALL[3], ALL[4], ALL[5]) if src.available()]
    if not ALL[3].available():
        out.append(ALL[3])   # always offer Flathub, with the "install Flatpak" hint
    return out


def by_id(sid: str) -> Source | None:
    return next((s for s in [*ALL, FLATPAK_FILE] if s.id == sid), None)

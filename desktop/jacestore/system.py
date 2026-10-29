"""What computer are we on? OS, CPU, Linux distro family and available package tools."""
import os
import platform
import shutil
import sys
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path


def child_env() -> dict:
    """Environment for programs we start (package managers, installers, the apps we
    install): without the AppImage / PyInstaller library paths of our own bundle."""
    env = {k: v for k, v in os.environ.items() if not k.startswith(("_PYI", "_MEI"))}
    for k in ("LD_LIBRARY_PATH", "QT_PLUGIN_PATH", "QML2_IMPORT_PATH", "QT_QPA_PLATFORM_PLUGIN_PATH", "PYTHONHOME", "PYTHONPATH"):
        env.pop(k, None)
    orig = os.environ.get("LD_LIBRARY_PATH_ORIG")
    if orig:
        env["LD_LIBRARY_PATH"] = orig
    env.pop("LD_LIBRARY_PATH_ORIG", None)
    env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    env["APPIMAGELAUNCHER_DISABLE"] = "1"
    return env


def which(name: str) -> str | None:
    return shutil.which(name, path=child_env().get("PATH"))


def read_os_release(path="/etc/os-release") -> dict:
    out = {}
    for p in (path, "/usr/lib/os-release"):
        try:
            for line in Path(p).read_text(encoding="utf-8", errors="replace").splitlines():
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    out[k.strip()] = v.strip().strip('"').strip("'")
            if out:
                return out
        except OSError:
            continue
    return out


FAMILIES = {
    "deb": ("debian", "ubuntu", "linuxmint", "pop", "elementary", "zorin", "raspbian", "kali", "neon"),
    "rpm": ("fedora", "rhel", "centos", "rocky", "almalinux", "opensuse", "suse", "sles", "mageia", "nobara", "ultramarine"),
    "arch": ("arch", "archlinux", "manjaro", "endeavouros", "cachyos", "garuda", "artix", "steamos"),
}


def family_from(os_release: dict) -> str:
    ids = [os_release.get("ID", "").lower(), *os_release.get("ID_LIKE", "").lower().split()]
    for fam, names in FAMILIES.items():
        if any(i in names or any(i.startswith(n) for n in names) for i in ids if i):
            return fam
    return "other"


@dataclass
class System:
    os: str                      # windows | macos | linux
    arch: str                    # x64 | arm64
    family: str | None = None    # linux: deb | rpm | arch | other
    distro: str = ""             # pretty name, e.g. "CachyOS", "Ubuntu 24.04 LTS"
    distro_id: str = ""
    package_manager: str | None = None   # apt | dnf | zypper | pacman
    has: list = field(default_factory=list)   # flatpak, snap, brew, winget, aur helper, pkexec...
    aur_helper: str | None = None
    immutable: bool = False      # Silverblue, SteamOS... (system packages can't be installed normally)

    def query(self) -> dict:
        """The ?os=&arch=&family=&has= parameters for the store API."""
        q = {"os": self.os, "arch": self.arch}
        if self.os == "linux":
            q["family"] = self.family or "other"
            q["has"] = ",".join(x for x in ("flatpak", "snap") if x in self.has)
        return q

    def describe(self) -> str:
        if self.os == "windows":
            return f"Windows {platform.release()} ({self.arch})"
        if self.os == "macos":
            return f"macOS {platform.mac_ver()[0]} ({'Apple Silicon' if self.arch == 'arm64' else 'Intel'})"
        pm = f", {self.package_manager}" if self.package_manager else ""
        return f"{self.distro or 'Linux'} ({self.arch}{pm})"


def _arch() -> str:
    m = platform.machine().lower()
    if m in ("arm64", "aarch64", "armv8l"):
        return "arm64"
    if sys.platform == "darwin":
        # an Intel build running under Rosetta reports x86_64; ask the kernel
        try:
            import subprocess
            if subprocess.run(["sysctl", "-n", "hw.optional.arm64"], capture_output=True, text=True).stdout.strip() == "1":
                return "arm64"
        except Exception:  # noqa: BLE001
            pass
    return "x64"


@lru_cache(maxsize=1)
def detect() -> System:
    arch = _arch()
    if sys.platform == "win32":
        return System("windows", arch, has=[x for x in ("winget",) if which(x)])
    if sys.platform == "darwin":
        has = ["brew"] if brew_path() else []
        return System("macos", arch, has=has)
    osr = read_os_release()
    fam = family_from(osr)
    pm = next((p for p in ("apt-get", "dnf", "zypper", "pacman") if which(p)), None)
    pm = {"apt-get": "apt"}.get(pm, pm)
    # the package manager is the better signal on unusual derivatives
    fam = {"apt": "deb", "dnf": "rpm", "zypper": "rpm", "pacman": "arch"}.get(pm, fam) if fam == "other" else fam
    has = [x for x in ("flatpak", "snap", "pkexec", "yay", "paru") if which(x)]
    immutable = Path("/run/ostree-booted").exists() or osr.get("ID") == "steamos"
    return System("linux", arch, fam, osr.get("PRETTY_NAME") or osr.get("NAME", "Linux"), osr.get("ID", ""),
                  pm, has, next((h for h in ("paru", "yay") if h in has), None), immutable)


def brew_path() -> str | None:
    for p in ("/opt/homebrew/bin/brew", "/usr/local/bin/brew"):
        if os.access(p, os.X_OK):
            return p
    return which("brew")


TERMINALS = [
    ("x-terminal-emulator", ["-e"]), ("gnome-terminal", ["--"]), ("kgx", ["--"]), ("ptyxis", ["--"]),
    ("konsole", ["-e"]), ("xfce4-terminal", ["-x"]), ("kitty", []), ("alacritty", ["-e"]),
    ("foot", []), ("wezterm", ["start", "--"]), ("tilix", ["-e"]), ("xterm", ["-e"]),
]


def terminal_command(argv: list[str]) -> list[str] | None:
    """Wrap a command so it runs in a visible terminal window (Linux), keeping the
    window open at the end so the user can read the result."""
    script = " ".join(_q(a) for a in argv) + '; echo; read -r -p "Done. Press Enter to close." _'
    for term, flag in TERMINALS:
        if which(term):
            return [term, *flag, "bash", "-c", script]
    return None


def _q(s: str) -> str:
    import shlex
    return shlex.quote(s)

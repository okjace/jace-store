"""File types the app can install (the same rules as the store's src/lib/fileFormats.ts)."""
import re


def format_of(filename: str) -> str:
    f = filename.lower()
    for ext, fmt in ((".deb", "deb"), (".rpm", "rpm"), (".appimage", "appimage"), (".flatpakref", "flatpakref"),
                     (".flatpak", "flatpak"), (".snap", "snap"), (".msi", "msi"), (".exe", "exe"), (".dmg", "dmg"),
                     (".app.zip", "app_zip"), (".pkg", "pkg"), (".apk", "apk")):
        if f.endswith(ext):
            return fmt
    if re.search(r"\.pkg\.tar\.(zst|xz|gz)$", f):
        return "pacman"
    if f.endswith((".msix", ".appx", ".msixbundle")):
        return "msix"
    if f.endswith((".sh", ".run")):
        return "sh"
    if f.endswith((".zip", ".7z")):
        return "zip"
    if re.search(r"\.(tar\.(gz|xz|zst|bz2)|tgz|txz)$", f):
        return "tar"
    return "other"


AUTO_INSTALL = {"deb", "rpm", "pacman", "appimage", "flatpakref", "flatpak", "snap", "msi", "msix", "dmg", "pkg", "app_zip"}


def action_for(fmt: str) -> str:
    """'install' for packages, disk images, AppImages...; 'open' for installer .exe files and everything else."""
    return "install" if fmt in AUTO_INSTALL else "open"

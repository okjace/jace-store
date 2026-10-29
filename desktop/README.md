# Jace Store desktop app

Install apps and games from [Jace Store](https://jace-store-deb.vercel.app) and from the software sources your
computer already uses, in one window. Python + PySide6, built the same way as Jace Launcher.

| | Jace Store catalog | Other sources |
|---|---|---|
| **Windows** | `.msi`, `.msix`, portable `.exe` / `.zip` (installed with a Start menu shortcut), or installer `.exe` files opened for you | winget, Chocolatey, Scoop |
| **macOS** | `.dmg`, `.app.zip`, `.pkg` (moved into Applications) | Homebrew (apps and formulae), MacPorts, the Mac App Store (mas), Nix |
| **Linux** | `.deb` / `.rpm` / pacman packages for *your* distro family, AppImage (with a menu entry), Flatpak, Snap, `.tar.gz` | your distro's packages (apt, dnf, zypper, pacman, xbps, apk, eopkg), Flathub, Snap, the AUR, AppImageHub, Nix, Homebrew |
| **Everywhere** | | Cargo, npm, pipx, **your own package managers** (Settings), and web search |

Every source can be browsed without searching (categories, an A-Z index, pages). Installs can be cancelled.
**My apps** is a private library (`library.json`, never uploaded) for programs and websites that aren't from a
package manager, with your own logos; it can also add every app already on the computer.

## How it picks a file
The store's desktop API (`/api/desktop/v1`) describes every file with a **format**, **platform**
(windows, macos, linux, linux-deb, linux-rpm, linux-arch, ...) and **arch**, detected from the filename
unless the app's owner set them on the project's Manage page. The app sends its OS, CPU and Linux package
family, and the API returns the best file: your distro's own package format first, then AppImage, then Flatpak.

## Install vs. download-and-open
Each file has an **install mode** chosen by the owner (Manage page, or `--install-mode` in the CLI):
- **auto** (default): packages, disk images, AppImages, Flatpaks and `.msi` files are installed; installer `.exe` files are opened.
- **install**: Jace Store installs it (a plain `.exe` becomes a portable app with a Start menu shortcut).
- **open**: Jace Store downloads it to your Downloads folder and opens it, e.g. to run the owner's own installer.

## Run from source
```bash
./run.sh
```
Tests (offline, safe: everything happens in temporary folders):
```bash
.venv/bin/python tests/selfcheck.py
.venv/bin/python -m jacestore --self-test
```

## Releases
`.github/workflows/desktop.yml` builds on GitHub's runners and tests each self-installer
(install, run, update step, uninstall):
- Windows: `JaceStore-<ver>-windows-x64.exe`, one file that installs itself to `%LOCALAPPDATA%\Programs\Jace Store`
- macOS: `JaceStore-<ver>-macos-arm64.app.zip` / `-x86_64.app.zip`, which moves itself into Applications
- Linux: `JaceStore-<ver>-x86_64.AppImage`, which copies itself to `~/Applications` and adds a menu entry

To release: bump `APP_VERSION` in `jacestore/__init__.py`, add a `## X.Y.Z` section to `CHANGELOG.md` and push
to `master`. When every build passes, the workflow publishes the GitHub Release `desktop-vX.Y.Z`. The app
updates itself from these releases, and the website's `/desktop` page links to the newest one.
If the repository has a `JACE_STORE_TOKEN` secret and a `jace-store-app` project exists on the store,
the release is also listed there.

## Command line
`--install --yes`, `--uninstall`, `--update --yes`, `--self-test`, `--version`, or a
`jacestore://project/<slug>` link (what the website's "Open in Jace Store app" button uses).

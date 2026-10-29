"""Jace Store desktop app: install apps and games from Jace Store and from the
software sources your OS already uses (winget, Homebrew, Flathub, Snap, apt,
dnf, pacman, zypper, the AUR)."""

APP_NAME = "Jace Store"
APP_VERSION = "1.1.0"
APP_ID = "io.github.okjace.JaceStore"
AUTHOR = "Jace"
STORE_URL = "https://jace-store-deb.vercel.app"
GITHUB_REPO = "okjace/jace-store"
GITHUB_URL = f"https://github.com/{GITHUB_REPO}"
TAG_PREFIX = "desktop-v"            # release tags: desktop-v1.0.0
URL_SCHEME = "jacestore"            # jacestore://project/<slug>

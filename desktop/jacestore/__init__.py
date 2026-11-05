"""Jace Store desktop app: install apps and games from Jace Store and from the
software sources your OS already uses (winget, Homebrew, Flathub, Snap, apt,
dnf, pacman, zypper, the AUR)."""

APP_NAME = "Jace Store"
APP_VERSION = "1.4.0"
APP_ID = "io.github.okjace.JaceStore"
AUTHOR = "Jace"
STORE_URL = "https://jace-store-deb.vercel.app"
GITHUB_REPO = "okjace/jace-store"
GITHUB_URL = f"https://github.com/{GITHUB_REPO}"
TAG_PREFIX = "desktop-v"            # release tags: desktop-v1.0.0
URL_SCHEME = "jacestore"            # jacestore://project/<slug>
# Jace Store's app on Jace (public id; Jace OS hands this app tokens for it: jace-account --token-for)
JACE_CLIENT_ID = "861d8147-69c3-4100-9191-1d8c149134c7"

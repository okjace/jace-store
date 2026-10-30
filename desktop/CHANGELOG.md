# Jace Store desktop: changelog

## 1.2.1
- Linux: opens on Wayland desktops that have AppImageLauncher installed (it crashed before Jace Store
  started). Menu entries for Jace Store and for AppImages it installs now skip AppImageLauncher;
  existing entries are fixed the next time Jace Store starts.
- Linux: your desktop's theme and native file dialogs load again on newer distros (an old bundled
  libmount clashed with the system's GLib).

## 1.2.0
- Cancel installs: Cancel stops the running download, installer or package manager, and Cancel all
  also clears the queue. (System package installs that already asked for your password finish first.)
- Every source can be browsed without searching: categories (Flathub, Snap, winget, AppImageHub, Jace
  Store), an A-Z index (your distro's packages, the AUR, Homebrew, AppImageHub) and "Load more" pages.
- Many more package managers: AppImageHub (AppImages from GitHub releases), Chocolatey and Scoop
  (Windows), MacPorts and the Mac App Store via mas (macOS), Nix, Homebrew formulae, Void (xbps),
  Alpine (apk), Solus (eopkg), Cargo, npm and pipx. Turn each on or off in Settings.
- Add your own package manager in Settings: its search, install and uninstall commands, with a Test button.
- Web search: find an app's website or download from the app; direct download links can be installed.
- My apps: a private library for apps that aren't from a package manager. Add any program or website with
  your own logo, or add every app already on this computer. It never leaves this computer.

## 1.1.0
- Opens Flathub's "Install" links: clicking Install on flathub.org (a .flatpakref download) or
  "Open in software manager" (appstream://) shows the app in Jace Store, ready to install.
  It can be turned off in Settings → Flathub links. Also opens .flatpak bundle files.
- "Open" now works for apps installed from Flathub and Snap.

## 1.0.0
- First release of the Jace Store desktop app for Windows, macOS and Linux.
- Browse and install apps and games from Jace Store. It picks the right download for your computer
  (OS, CPU, and on Linux your distro: .deb, .rpm, pacman packages, AppImage, Flatpak).
- Installs files itself or downloads and opens them, as each app's owner chose.
- Search and install from other sources: winget (Windows), Homebrew (macOS), Flathub, Snap,
  your distro's packages (apt, dnf, zypper, pacman) and the AUR (Linux).
- Installed and Updates pages; uninstall what Jace Store installed.
- "Open in Jace Store app" links on the website (jacestore://).
- Self-installing setup, one-click self-updates.

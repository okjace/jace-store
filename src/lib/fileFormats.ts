/**
 * What kind of file is this, and which computers is it for? Used by the desktop
 * app API to pick the right download for the user's OS / distro / CPU and to decide
 * whether the app installs a file itself or downloads it and opens it.
 * Owners can override platform/arch/install_mode per file; otherwise we detect.
 */

export const PLATFORMS = [
  { id: "any", label: "Any computer" },
  { id: "windows", label: "Windows" },
  { id: "macos", label: "macOS" },
  { id: "linux", label: "Linux (any distro)" },
  { id: "linux-deb", label: "Linux: Debian / Ubuntu / Mint" },
  { id: "linux-rpm", label: "Linux: Fedora / openSUSE / RHEL" },
  { id: "linux-arch", label: "Linux: Arch / CachyOS / Manjaro" },
  { id: "android", label: "Android" },
] as const;
export type PlatformId = (typeof PLATFORMS)[number]["id"];

export const ARCHES = [
  { id: "any", label: "Any CPU" },
  { id: "x64", label: "x64 (Intel / AMD)" },
  { id: "arm64", label: "ARM64 (Apple Silicon, Snapdragon)" },
] as const;
export type ArchId = (typeof ARCHES)[number]["id"];

export const INSTALL_MODES = [
  { id: "auto", label: "Let Jace Store decide", hint: "Packages and disk images get installed; installer .exe files get opened" },
  { id: "install", label: "Jace Store installs it", hint: "Installed for the user: package manager, Applications folder, Start menu shortcut" },
  { id: "open", label: "Download, then open it", hint: "Jace Store downloads the file and opens it, e.g. runs your own installer" },
] as const;
export type InstallMode = (typeof INSTALL_MODES)[number]["id"];

/** Project types the desktop app shows and installs. */
export const DESKTOP_TYPES = ["app", "game"] as const;

export type Format =
  | "deb" | "rpm" | "pacman" | "appimage" | "flatpakref" | "flatpak" | "snap" | "sh"
  | "msi" | "msix" | "exe"
  | "dmg" | "pkg" | "app_zip"
  | "apk" | "zip" | "tar" | "other";

/** Formats the desktop app knows how to install by itself. */
const INSTALLABLE: Format[] = ["deb", "rpm", "pacman", "appimage", "flatpakref", "flatpak", "snap", "msi", "msix", "exe", "dmg", "pkg", "app_zip", "zip", "tar"];
/** What "auto" means per format. */
const AUTO_INSTALL: Format[] = ["deb", "rpm", "pacman", "appimage", "flatpakref", "flatpak", "snap", "msi", "msix", "dmg", "pkg", "app_zip"];

export function formatOf(filename: string): Format {
  const f = filename.toLowerCase();
  if (f.endsWith(".deb")) return "deb";
  if (f.endsWith(".rpm")) return "rpm";
  if (/\.pkg\.tar\.(zst|xz|gz)$/.test(f)) return "pacman";
  if (f.endsWith(".appimage")) return "appimage";
  if (f.endsWith(".flatpakref")) return "flatpakref";
  if (f.endsWith(".flatpak")) return "flatpak";
  if (f.endsWith(".snap")) return "snap";
  if (f.endsWith(".sh") || f.endsWith(".run")) return "sh";
  if (f.endsWith(".msi")) return "msi";
  if (f.endsWith(".msix") || f.endsWith(".appx") || f.endsWith(".msixbundle")) return "msix";
  if (f.endsWith(".exe")) return "exe";
  if (f.endsWith(".dmg")) return "dmg";
  if (f.endsWith(".pkg")) return "pkg";
  if (f.endsWith(".app.zip")) return "app_zip";
  if (f.endsWith(".apk")) return "apk";
  if (f.endsWith(".zip") || f.endsWith(".7z")) return "zip";
  if (/\.(tar\.(gz|xz|zst|bz2)|tgz|txz)$/.test(f)) return "tar";
  return "other";
}

function platformFromName(f: string): PlatformId | null {
  if (/(^|[^a-z])(win(dows)?|win32|win64)([^a-z]|$)/.test(f)) return "windows";
  if (/(^|[^a-z])(mac(os)?|osx|darwin)([^a-z]|$)/.test(f)) return "macos";
  if (/(^|[^a-z])linux([^a-z]|$)/.test(f)) return "linux";
  if (/(^|[^a-z])android([^a-z]|$)/.test(f)) return "android";
  return null;
}

export function detectPlatform(filename: string): PlatformId {
  const f = filename.toLowerCase();
  switch (formatOf(filename)) {
    case "deb": return "linux-deb";
    case "rpm": return "linux-rpm";
    case "pacman": return "linux-arch";
    case "appimage": case "flatpakref": case "flatpak": case "snap": case "sh": return "linux";
    case "msi": case "msix": case "exe": return "windows";
    case "dmg": case "pkg": case "app_zip": return "macos";
    case "apk": return "android";
    default: {
      // macOS apps are often shipped as Name-mac.zip containing Name.app
      return platformFromName(f) ?? "any";
    }
  }
}

export function detectArch(filename: string): ArchId {
  const f = filename.toLowerCase();
  if (/(arm64|aarch64|apple-?silicon)/.test(f)) return "arm64";
  if (/universal/.test(f)) return "any";
  if (/(x86[_-]64|amd64|x64|win64|intel)/.test(f)) return "x64";
  return "any";
}

/** What the desktop app will do with a file. */
export function actionFor(mode: string | null | undefined, format: Format): "install" | "open" {
  if (mode === "open") return "open";
  if (mode === "install") return INSTALLABLE.includes(format) ? "install" : "open";
  return AUTO_INSTALL.includes(format) ? "install" : "open";
}

export interface FileInstallInfo {
  format: Format;
  platform: PlatformId;
  arch: ArchId;
  install_mode: InstallMode;
  action: "install" | "open";
  /** True when the owner set platform/arch, false when we guessed from the filename. */
  platform_set: boolean;
}

export function fileInstallInfo(f: { filename: string; platform?: string | null; arch?: string | null; install_mode?: string | null }): FileInstallInfo {
  // macOS .zip with a mac hint in the name is almost always a zipped .app
  let format = formatOf(f.filename);
  const platform = (f.platform as PlatformId) || detectPlatform(f.filename);
  if (format === "zip" && platform === "macos") format = "app_zip";
  const mode = (f.install_mode as InstallMode) || "auto";
  return {
    format,
    platform,
    arch: (f.arch as ArchId) || detectArch(f.filename),
    install_mode: mode,
    action: actionFor(mode, format),
    platform_set: !!f.platform,
  };
}

export interface Client {
  os: "windows" | "macos" | "linux" | "android";
  /** Linux package family: deb, rpm, arch, or other */
  family?: string | null;
  arch?: "x64" | "arm64" | null;
  /** Linux: which of these the computer has (flatpak, snap). */
  has?: string[];
}

/**
 * How well a file fits a computer: higher is better, -1 = can't use it.
 * On Linux the distro's own package format beats AppImage beats Flatpak.
 */
export function fitScore(info: FileInstallInfo, c: Client): number {
  if (info.arch !== "any" && c.arch && info.arch !== c.arch) {
    // Apple Silicon runs Intel Mac apps through Rosetta; Windows on ARM emulates x64
    if (!(info.arch === "x64" && c.arch === "arm64" && (c.os === "macos" || c.os === "windows"))) return -1;
  }
  const archBonus = info.arch === c.arch ? 3 : 0;
  const p = info.platform;
  if (p === "any") return 10 + archBonus;
  if (c.os === "linux") {
    if (p === "linux-deb" || p === "linux-rpm" || p === "linux-arch") {
      return p === `linux-${c.family}` ? 60 + archBonus : -1;
    }
    if (p !== "linux") return -1;
    if (info.format === "appimage") return 50 + archBonus;
    if (info.format === "flatpakref" || info.format === "flatpak") return c.has?.includes("flatpak") === false ? -1 : 45 + archBonus;
    if (info.format === "snap") return c.has?.includes("snap") ? 40 + archBonus : -1;
    return 30 + archBonus;
  }
  if (p !== c.os) return -1;
  const prefer: Partial<Record<Format, number>> = { msi: 55, msix: 50, exe: 52, dmg: 55, app_zip: 56, pkg: 50, apk: 50 };
  return (prefer[info.format] ?? 30) + archBonus;
}

/**
 * Pick install_mode / platform / arch out of a request body. Returns the columns to
 * write, or an error message. "" or null clears platform/arch back to "detect".
 */
export function installFields(b: Record<string, unknown>): { patch: Record<string, string | null> } | { error: string } {
  const patch: Record<string, string | null> = {};
  if ("install_mode" in b && b.install_mode != null) {
    if (!INSTALL_MODES.some((m) => m.id === b.install_mode)) return { error: "install_mode must be auto, install or open" };
    patch.install_mode = String(b.install_mode);
  }
  if ("platform" in b) {
    const v = b.platform ? String(b.platform) : null;
    if (v && !PLATFORMS.some((p) => p.id === v)) return { error: `platform must be one of: ${PLATFORMS.map((p) => p.id).join(", ")}` };
    patch.platform = v;
  }
  if ("arch" in b) {
    const v = b.arch ? String(b.arch) : null;
    if (v && !ARCHES.some((a) => a.id === v)) return { error: "arch must be any, x64 or arm64" };
    patch.arch = v;
  }
  return { patch };
}

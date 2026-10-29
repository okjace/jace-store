/** Where the Jace Store desktop app is released (GitHub Releases, tags desktop-v*). */
export const DESKTOP_REPO = process.env.DESKTOP_REPO || "okjace/jace-store";
export const DESKTOP_TAG_PREFIX = "desktop-v";

export interface DesktopAsset { name: string; url: string; size: number; os: "windows" | "macos" | "linux"; label: string }
export interface DesktopRelease { version: string; url: string; published_at: string; assets: DesktopAsset[] }

function describe(name: string): Pick<DesktopAsset, "os" | "label"> | null {
  if (name.endsWith("-windows-x64.exe")) return { os: "windows", label: "Windows (64-bit)" };
  if (name.endsWith("-macos-arm64.app.zip")) return { os: "macos", label: "macOS (Apple Silicon)" };
  if (name.endsWith("-macos-x86_64.app.zip")) return { os: "macos", label: "macOS (Intel)" };
  if (name.endsWith("-x86_64.AppImage")) return { os: "linux", label: "Linux (AppImage, any distro)" };
  return null;
}

/** Latest desktop release, or null if there isn't one yet. Cached for 10 minutes. */
export async function latestDesktopRelease(): Promise<DesktopRelease | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${DESKTOP_REPO}/releases?per_page=30`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "jace-store" },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const releases = (await res.json()) as { tag_name: string; draft: boolean; prerelease: boolean; html_url: string; published_at: string; assets: { name: string; browser_download_url: string; size: number }[] }[];
    const rel = releases.find((r) => !r.draft && !r.prerelease && r.tag_name.startsWith(DESKTOP_TAG_PREFIX));
    if (!rel) return null;
    return {
      version: rel.tag_name.slice(DESKTOP_TAG_PREFIX.length),
      url: rel.html_url,
      published_at: rel.published_at,
      assets: rel.assets.flatMap((a) => {
        const d = describe(a.name);
        return d ? [{ name: a.name, url: a.browser_download_url, size: a.size, ...d }] : [];
      }),
    };
  } catch {
    return null;
  }
}

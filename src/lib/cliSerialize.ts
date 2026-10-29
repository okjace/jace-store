import { siteUrl } from "./constants";
import type { FileRow } from "./types";
import { fileInstallInfo } from "./fileFormats";

export const fileOut = (f: FileRow) => ({
  id: f.id,
  filename: f.filename,
  label: f.label,
  primary: f.is_primary,
  external: f.is_external,
  url: f.url,
  download_url: `${siteUrl()}/api/download/${f.id}`,
  size: f.size,
  sha1: f.sha1,
  sha512: f.sha512,
  install_mode: f.install_mode ?? "auto",
  platform: f.platform ?? null,
  arch: f.arch ?? null,
  /** What the desktop app sees (detected from the filename where not set). */
  desktop: fileInstallInfo(f),
});

export const PROJECT_FIELDS = ["title", "summary", "description", "categories", "source_url", "issues_url", "license", "download_mode", "primary_version_id"] as const;

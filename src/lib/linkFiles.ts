import { createHash } from "node:crypto";
import { ApiError } from "./apiAuth";
import { installFields } from "./fileFormats";
import { typeInfo } from "./constants";
import { createAdminClient } from "./supabase/admin";

const MAX_HASH_BYTES = 500 * 1024 * 1024;

export function checkLinkUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ApiError(400, `Not a valid URL: ${raw}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new ApiError(400, "Links must be http(s)");
  const h = u.hostname;
  if (h === "localhost" || h.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/.test(h)) {
    throw new ApiError(400, "Links must point to a public host");
  }
  return u;
}

/** Download a link and compute sha1/sha512/size (streamed, capped at 500 MB). */
export async function hashRemote(url: string) {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "JaceStore/1.0 (+link verification)" } });
  if (!res.ok || !res.body) throw new ApiError(400, `Couldn't download link (HTTP ${res.status})`);
  const sha1 = createHash("sha1");
  const sha512 = createHash("sha512");
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_HASH_BYTES) {
      await reader.cancel();
      throw new ApiError(400, "Linked file is over 500 MB, too big to verify");
    }
    sha1.update(value);
    sha512.update(value);
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const fromHeader = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  return { sha1: sha1.digest("hex"), sha512: sha512.digest("hex"), size, filename: fromHeader ? decodeURIComponent(fromHeader) : null };
}

export interface LinkInput {
  url: string;
  filename?: string;
  label?: string;
  install_mode?: string;
  platform?: string | null;
  arch?: string | null;
  primary?: boolean;
  sha1?: string;
  sha512?: string;
  size?: number;
  /** Skip downloading the link to compute hashes (not allowed for Minecraft content). */
  skip_hash?: boolean;
}

/**
 * Add an external download link to a version. For Minecraft content the server
 * downloads it once to compute hashes, because launchers (Prism, ATLauncher,
 * Modrinth App) refuse files without a verified SHA-1/SHA-512.
 */
export async function addLinkFile(version: { id: string; project: { type: string } }, input: LinkInput) {
  const u = checkLinkUrl(String(input.url ?? ""));
  const mc = typeInfo(version.project.type).minecraft;
  let { sha1, sha512, size } = input;
  let filename = input.filename?.trim() || decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "") || u.hostname;

  const haveHashes = !!(sha1 && sha512 && size);
  if (!haveHashes && !(input.skip_hash && !mc)) {
    try {
      const h = await hashRemote(u.toString());
      sha1 = h.sha1; sha512 = h.sha512; size = h.size;
      if (!input.filename && h.filename) filename = h.filename;
    } catch (e) {
      if (mc) throw e instanceof ApiError ? new ApiError(400, `${e.message}. Minecraft links must be downloadable so launchers can verify them.`) : e;
      sha1 = sha512 = undefined; size = undefined; // non-Minecraft: keep the link without hashes
    }
  }
  if (sha1 && !/^[0-9a-f]{40}$/i.test(sha1)) throw new ApiError(400, "sha1 must be 40 hex characters");
  if (sha512 && !/^[0-9a-f]{128}$/i.test(sha512)) throw new ApiError(400, "sha512 must be 128 hex characters");

  const inst = installFields(input as unknown as Record<string, unknown>);
  if ("error" in inst) throw new ApiError(400, inst.error);
  const admin = createAdminClient();
  if (input.primary) await admin.from("files").update({ is_primary: false }).eq("version_id", version.id);
  const { count } = await admin.from("files").select("id", { count: "exact", head: true }).eq("version_id", version.id);
  const { data, error } = await admin
    .from("files")
    .insert({
      version_id: version.id,
      filename: filename.slice(0, 200),
      label: input.label?.trim().slice(0, 80) || null,
      ...inst.patch,
      url: u.toString(),
      storage_path: null,
      is_external: true,
      size: size ?? null,
      sha1: sha1?.toLowerCase() ?? null,
      sha512: sha512?.toLowerCase() ?? null,
      is_primary: input.primary ?? (count ?? 0) === 0,
    })
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  return data;
}

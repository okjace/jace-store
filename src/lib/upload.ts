"use client";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function hashFile(file: File) {
  const data = await file.arrayBuffer();
  const [sha1, sha512] = await Promise.all([
    crypto.subtle.digest("SHA-1", data),
    crypto.subtle.digest("SHA-512", data),
  ]);
  return { sha1: hex(sha1), sha512: hex(sha512) };
}

export { safeFilename } from "./filenames";

/** Upload to the public bucket under the user's folder; returns the public URL. */
export async function uploadToBucket(
  supabase: SupabaseClient,
  bucket: "project-files" | "icons",
  path: string,
  file: File
) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
    cacheControl: "31536000",
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export interface DetectedMeta {
  versionNumber?: string;
  name?: string;
  loaders?: string[];
  gameVersions?: string[];
}

/**
 * Peek inside mod jars and .mrpack files to pre-fill the version form.
 * Best-effort: any failure just returns {}.
 */
export async function detectMeta(file: File): Promise<DetectedMeta> {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".jar") && !lower.endsWith(".mrpack")) return {};
  try {
    const zip = await JSZip.loadAsync(file);
    const read = async (p: string) => (await zip.file(p)?.async("string")) ?? null;

    if (lower.endsWith(".mrpack")) {
      const idx = await read("modrinth.index.json");
      if (!idx) return {};
      const j = JSON.parse(idx);
      const deps: Record<string, string> = j.dependencies ?? {};
      const loaderMap: Record<string, string> = {
        "fabric-loader": "fabric", "quilt-loader": "quilt", forge: "forge", neoforge: "neoforge",
      };
      return {
        versionNumber: j.versionId,
        name: j.name ? `${j.name} ${j.versionId ?? ""}`.trim() : undefined,
        gameVersions: deps.minecraft ? [deps.minecraft] : undefined,
        loaders: Object.keys(deps).map((k) => loaderMap[k]).filter(Boolean),
      };
    }

    const fabric = await read("fabric.mod.json");
    if (fabric) {
      const j = JSON.parse(fabric);
      const mc = j.depends?.minecraft;
      return {
        versionNumber: j.version,
        name: j.name ? `${j.name} ${j.version}` : undefined,
        loaders: ["fabric"],
        gameVersions: typeof mc === "string" && /^\d+\.\d+(\.\d+)?$/.test(mc.replace(/^[~=>]+/, ""))
          ? [mc.replace(/^[~=>]+/, "")] : undefined,
      };
    }
    const quilt = await read("quilt.mod.json");
    if (quilt) {
      const j = JSON.parse(quilt);
      return { versionNumber: j.quilt_loader?.version, loaders: ["quilt"] };
    }
    const neo = await read("META-INF/neoforge.mods.toml");
    const forge = neo ?? (await read("META-INF/mods.toml"));
    if (forge) {
      const version = forge.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1];
      const name = forge.match(/^\s*displayName\s*=\s*"([^"]+)"/m)?.[1];
      let versionNumber = version;
      if (version === "${file.jarVersion}") {
        const manifest = await read("META-INF/MANIFEST.MF");
        versionNumber = manifest?.match(/Implementation-Version:\s*(\S+)/)?.[1];
      }
      return {
        versionNumber,
        name: name && versionNumber ? `${name} ${versionNumber}` : undefined,
        loaders: [neo ? "neoforge" : "forge"],
      };
    }
    if (await read("plugin.yml") || await read("paper-plugin.yml")) {
      const y = (await read("paper-plugin.yml")) ?? (await read("plugin.yml"))!;
      return { versionNumber: y.match(/^version:\s*['"]?([^'"\n]+)/m)?.[1]?.trim() };
    }
  } catch {
    /* not a zip or unreadable — ignore */
  }
  return {};
}

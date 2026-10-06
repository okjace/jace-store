import { createPublicClient } from "@/lib/supabase/server";
import type { Version } from "@/lib/types";

export type Algorithm = "sha1" | "sha512";

export function algorithmFrom(v: string | null | undefined): Algorithm {
  return v === "sha512" ? "sha512" : "sha1";
}

/** Map of hash -> version that contains a file with that hash. */
export async function versionsByHashes(hashes: string[], algorithm: Algorithm) {
  const clean = [...new Set(hashes.map((h) => h.toLowerCase()).filter((h) => /^[0-9a-f]+$/.test(h)))].slice(0, 500);
  const result = new Map<string, Version & { owner_id: string }>();
  if (!clean.length) return result;
  const supabase = createPublicClient();
  const { data: files } = await supabase
    .from("files")
    .select(`${algorithm}, version:versions(*, files(*), project:projects!versions_project_id_fkey(owner_id))`)
    .in(algorithm, clean);
  for (const row of (files ?? []) as unknown as Record<string, unknown>[]) {
    const v = row.version as (Version & { project?: { owner_id: string } }) | null;
    if (v) result.set(row[algorithm] as string, { ...v, owner_id: v.project?.owner_id ?? "" });
  }
  return result;
}

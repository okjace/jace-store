import { badRequest, json, preflight, serializeVersion } from "@/lib/api";
import { algorithmFrom, versionsByHashes } from "@/lib/hashLookup";

export const OPTIONS = preflight;

/** POST /api/v2/version_files  Body: { "hashes": [...], "algorithm": "sha1" } → { hash: version } */
export async function POST(req: Request) {
  let body: { hashes?: string[]; algorithm?: string } = {};
  try { body = await req.json(); } catch { return badRequest("Body must be JSON"); }
  if (!Array.isArray(body.hashes)) return badRequest("hashes must be an array");
  const found = await versionsByHashes(body.hashes, algorithmFrom(body.algorithm));
  const out: Record<string, unknown> = {};
  for (const [h, v] of found) out[h] = serializeVersion(v, v.owner_id);
  return json(out, { cache: 0 });
}

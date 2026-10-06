import { json, notFound, preflight, serializeVersion } from "@/lib/api";
import { algorithmFrom, versionsByHashes } from "@/lib/hashLookup";

export const OPTIONS = preflight;

/** GET /api/v2/version_file/{hash}?algorithm=sha1|sha512 — identify a file on disk. */
export async function GET(req: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const algorithm = algorithmFrom(new URL(req.url).searchParams.get("algorithm"));
  const found = (await versionsByHashes([hash], algorithm)).get(hash.toLowerCase());
  return found ? json(serializeVersion(found, found.owner_id)) : notFound("file");
}

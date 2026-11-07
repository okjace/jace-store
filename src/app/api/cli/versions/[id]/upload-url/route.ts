import { requireCanPost } from "@/lib/accountModeration";
import { ApiError, handler, ownedVersion, readJson, requireApiUser } from "@/lib/apiAuth";
import { uploadTarget } from "@/lib/fileStorage";

/**
 * POST { filename, size? } -> { upload_url, path, provider, headers }
 * PUT the raw file bytes to upload_url (with those headers), then register it with
 * POST /files { kind: "upload", path, provider, ... }. With its size, a file can go to Cloudflare R2
 * (while Jace Store's R2 space lasts); without, it goes to Supabase Storage.
 */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireApiUser(req);
  const v = await ownedVersion(userId, (await params).id);
  await requireCanPost(userId);
  const { filename, size } = await readJson<{ filename?: string; size?: number }>(req);
  if (!filename) throw new ApiError(400, "filename is required");
  const n = Number(size);
  if (size != null && !(n > 0 && n <= 500 * 1024 * 1024)) throw new ApiError(400, "Files can be up to 500 MB");
  try {
    return await uploadTarget(userId, v.project.id, v.id, filename, size == null ? null : n);
  } catch (e) {
    throw new ApiError(500, e instanceof Error ? e.message : "Couldn't create upload URL");
  }
});

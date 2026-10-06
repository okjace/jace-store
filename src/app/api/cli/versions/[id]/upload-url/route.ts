import { ApiError, handler, ownedVersion, readJson, requireApiUser } from "@/lib/apiAuth";
import { safeFilename } from "@/lib/filenames";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST { filename } -> { upload_url, path }
 * PUT the raw file bytes to upload_url, then register it with POST /files { kind: "upload", path, ... }.
 */
export const POST = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireApiUser(req);
  const v = await ownedVersion(userId, (await params).id);
  const { filename } = await readJson<{ filename?: string }>(req);
  if (!filename) throw new ApiError(400, "filename is required");
  const path = `${userId}/${v.project.id}/${v.id}/${safeFilename(filename)}`;
  const { data, error } = await createAdminClient().storage.from("project-files").createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new ApiError(500, error?.message ?? "Couldn't create upload URL");
  return { upload_url: data.signedUrl, path };
});

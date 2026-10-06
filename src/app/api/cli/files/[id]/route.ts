import { ApiError, handler, ownedVersion, requireApiUser } from "@/lib/apiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

/** DELETE: remove one file (upload or link) from a version. */
export const DELETE = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireApiUser(req);
  const { id } = await params;
  const admin = createAdminClient();
  const { data: file } = await admin.from("files").select("id, version_id, storage_path").eq("id", id).maybeSingle();
  if (!file) throw new ApiError(404, "File not found");
  await ownedVersion(userId, file.version_id);
  await admin.from("files").delete().eq("id", file.id);
  if (file.storage_path) await admin.storage.from("project-files").remove([file.storage_path]);
  return { deleted: file.id };
});

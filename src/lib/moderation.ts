import { createAdminClient } from "./supabase/admin";

export { REPORT_REASONS, reasonLabel } from "./moderation-reasons";

export async function isAdmin(userId: string | undefined | null) {
  if (!userId) return false;
  const { data } = await createAdminClient().from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

/** Delete a project with all versions, file records and uploaded files. */
export async function deleteProjectCompletely(projectId: string) {
  const admin = createAdminClient();
  const { data: versions } = await admin.from("versions").select("files(storage_path)").eq("project_id", projectId);
  const paths = (versions ?? [])
    .flatMap((v) => (v.files as { storage_path: string | null }[]).map((f) => f.storage_path))
    .filter(Boolean) as string[];
  const { error } = await admin.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
  for (let i = 0; i < paths.length; i += 500) await admin.storage.from("project-files").remove(paths.slice(i, i + 500));
  return paths.length;
}

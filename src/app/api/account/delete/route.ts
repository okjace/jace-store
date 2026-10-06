import { ApiError, handler, readJson } from "@/lib/apiAuth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** Every object under `prefix` in a bucket (storage listing isn't recursive). */
async function listAll(admin: Admin, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (!data?.length) break;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      // Folders come back without an id.
      if (item.id) out.push(path);
      else out.push(...(await listAll(admin, bucket, path, depth + 1)));
    }
    if (data.length < 1000) break;
  }
  return out;
}

/**
 * POST { confirm: "<username>" } — permanently delete the signed-in account.
 * Removes uploaded files first, then the auth user; the database cascades to the
 * profile, projects, versions, file records, API tokens and linked sign-ins.
 * Website session only (an API token can't delete an account).
 */
export const POST = handler(async (req) => {
  if (req.headers.get("authorization")) throw new ApiError(403, "Delete your account from the website");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "Sign in first");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("username").eq("id", user.id).maybeSingle();
  const { confirm } = await readJson<{ confirm?: string }>(req);
  if (!profile || confirm !== profile.username) throw new ApiError(400, "Type your username exactly to confirm");

  // Uploaded files: everything in the user's folders, plus anything the files
  // table points at (covers files uploaded through the CLI).
  const { data: projects } = await admin.from("projects").select("id, versions!versions_project_id_fkey(files(storage_path))").eq("owner_id", user.id);
  const tracked = (projects ?? []).flatMap((p) =>
    (p.versions as { files: { storage_path: string | null }[] }[]).flatMap((v) => v.files.map((f) => f.storage_path))
  ).filter(Boolean) as string[];
  const projectFiles = [...new Set([...tracked, ...(await listAll(admin, "project-files", user.id))])];
  const images = await listAll(admin, "icons", user.id);
  for (let i = 0; i < projectFiles.length; i += 500) await admin.storage.from("project-files").remove(projectFiles.slice(i, i + 500));
  for (let i = 0; i < images.length; i += 500) await admin.storage.from("icons").remove(images.slice(i, i + 500));

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new ApiError(500, `Couldn't delete account: ${error.message}`);
  await supabase.auth.signOut().catch(() => {});
  return { deleted: true, files_removed: projectFiles.length + images.length };
});

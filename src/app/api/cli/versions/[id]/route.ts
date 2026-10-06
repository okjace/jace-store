import { ApiError, handler, ownedVersion, readJson, requireApiUser } from "@/lib/apiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH: edit name / changelog / channel / loaders / game_versions. */
export const PATCH = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const v = await ownedVersion(userId, (await params).id);
  const b = await readJson<Record<string, unknown>>(req);
  const patch: Record<string, unknown> = {};
  if ("name" in b) patch.name = String(b.name);
  if ("changelog" in b) patch.changelog = String(b.changelog);
  if ("channel" in b) patch.release_channel = String(b.channel);
  if (Array.isArray(b.loaders)) patch.loaders = b.loaders.map(String);
  if (Array.isArray(b.game_versions)) patch.game_versions = b.game_versions.map(String);
  if (!Object.keys(patch).length) throw new ApiError(400, "Nothing to update");
  const { data, error } = await createAdminClient().from("versions").update(patch).eq("id", v.id).select().single();
  if (error) throw new ApiError(400, error.message);
  return data;
});

/** DELETE: remove a version and its uploaded files. */
export const DELETE = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const v = await ownedVersion(userId, (await params).id);
  const admin = createAdminClient();
  const { data: files } = await admin.from("files").select("storage_path").eq("version_id", v.id);
  await admin.from("versions").delete().eq("id", v.id);
  const paths = (files ?? []).map((f) => f.storage_path).filter(Boolean) as string[];
  if (paths.length) await admin.storage.from("project-files").remove(paths);
  return { deleted: v.id };
});

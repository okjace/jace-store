import { guardPost } from "@/lib/accountModeration";
import { ApiError, handler, ownedVersion, readJson, requireApiUser } from "@/lib/apiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDependencies } from "@/lib/dependencies";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH: edit name / changelog / channel / loaders / game_versions / dependencies. */
export const PATCH = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const v = await ownedVersion(userId, (await params).id);
  const b = await readJson<Record<string, unknown>>(req);
  const patch: Record<string, unknown> = {};
  if ("name" in b) patch.name = String(b.name);
  if ("version_number" in b) {
    const n = String(b.version_number).trim();
    if (!n || n.length > 64) throw new ApiError(400, "version_number must be 1-64 characters");
    patch.version_number = n;
  }
  if ("changelog" in b) patch.changelog = String(b.changelog);
  if ("channel" in b) {
    if (!["release", "beta", "alpha"].includes(String(b.channel))) throw new ApiError(400, "channel must be release, beta or alpha");
    patch.release_channel = String(b.channel);
  }
  if (Array.isArray(b.loaders)) patch.loaders = b.loaders.map(String);
  if (Array.isArray(b.game_versions)) patch.game_versions = b.game_versions.map(String);
  if ("dependencies" in b) patch.dependencies = parseDependencies(b.dependencies);
  if (!Object.keys(patch).length) throw new ApiError(400, "Nothing to update");
  await guardPost(userId, "version", { names: [patch.name as string, patch.version_number as string], texts: [patch.changelog as string] });
  const { data, error } = await createAdminClient().from("versions").update(patch).eq("id", v.id).select().single();
  if (error) throw new ApiError(400, error.code === "23505" ? "Another version already has that number" : error.message);
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

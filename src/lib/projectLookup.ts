import { ApiError } from "./apiAuth";
import { createAdminClient } from "./supabase/admin";

/** Any project by slug or id (not just your own). */
export async function anyProject(slugOrId: string) {
  const isId = /^[0-9a-f-]{36}$/i.test(slugOrId);
  const { data } = await createAdminClient().from("projects").select("id, slug, title, owner_id").eq(isId ? "id" : "slug", slugOrId).maybeSingle();
  if (!data) throw new ApiError(404, "Project not found");
  return data;
}

import { ApiError, handler, readJson, requireApiUser } from "@/lib/apiAuth";
import { requireCanPost } from "@/lib/accountModeration";
import { ownedCollection, touch } from "@/lib/collections";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** POST { project_id } — add a project. */
export const POST = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const c = await ownedCollection(userId, (await params).id);
  await requireCanPost(userId);
  const { project_id } = await readJson<{ project_id?: string }>(req);
  const admin = createAdminClient();
  const { data: p } = await admin.from("projects").select("id").eq("id", String(project_id ?? "")).maybeSingle();
  if (!p) throw new ApiError(404, "Project not found");
  const { count } = await admin.from("collection_items").select("project_id", { count: "exact", head: true }).eq("collection_id", c.id);
  if ((count ?? 0) >= 500) throw new ApiError(400, "A collection can hold up to 500 projects");
  await admin.from("collection_items").upsert({ collection_id: c.id, project_id: p.id }, { onConflict: "collection_id,project_id", ignoreDuplicates: true });
  await touch(c.id);
  return { added: p.id };
});

/** DELETE ?project_id= — take a project out. */
export const DELETE = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const c = await ownedCollection(userId, (await params).id);
  const pid = new URL(req.url).searchParams.get("project_id") ?? "";
  await createAdminClient().from("collection_items").delete().eq("collection_id", c.id).eq("project_id", pid);
  await touch(c.id);
  return { removed: pid };
});

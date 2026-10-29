import { ApiError, handler, readJson, requireApiUser } from "@/lib/apiAuth";
import { guardPost } from "@/lib/accountModeration";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET ?project=<id> — your collections (and whether each has that project). */
export const GET = handler(async (req) => {
  const userId = await requireApiUser(req);
  const project = new URL(req.url).searchParams.get("project");
  const { data } = await createAdminClient().from("collections")
    .select("id, title, is_public, updated_at, collection_items(project_id)").eq("owner_id", userId).order("updated_at", { ascending: false });
  return (data ?? []).map((c) => {
    const items = (c.collection_items ?? []) as { project_id: string }[];
    return { id: c.id, title: c.title, is_public: c.is_public, count: items.length, has: project ? items.some((i) => i.project_id === project) : undefined };
  });
});

/** POST { title, description?, is_public?, project_id? } — make a collection (optionally with a first project). */
export const POST = handler(async (req) => {
  const userId = await requireApiUser(req);
  const b = await readJson<{ title?: string; description?: string; is_public?: boolean; project_id?: string }>(req);
  const title = String(b.title ?? "").trim().slice(0, 80);
  if (!title) throw new ApiError(400, "Give the collection a name");
  const description = String(b.description ?? "").trim().slice(0, 2000);
  await guardPost(userId, "collection", { names: [title], texts: [description] });
  const admin = createAdminClient();
  const { count } = await admin.from("collections").select("id", { count: "exact", head: true }).eq("owner_id", userId);
  if ((count ?? 0) >= 100) throw new ApiError(400, "You can have up to 100 collections");
  const { data, error } = await admin.from("collections").insert({ owner_id: userId, title, description, is_public: b.is_public !== false }).select().single();
  if (error) throw new ApiError(400, error.message);
  if (b.project_id) await admin.from("collection_items").insert({ collection_id: data.id, project_id: b.project_id }).then(() => {}, () => {});
  return data;
});

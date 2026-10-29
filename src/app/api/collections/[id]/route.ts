import { ApiError, handler, readJson, requireApiUser } from "@/lib/apiAuth";
import { guardPost } from "@/lib/accountModeration";
import { ownedCollection } from "@/lib/collections";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH { title?, description?, is_public? } */
export const PATCH = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const c = await ownedCollection(userId, (await params).id);
  const b = await readJson<{ title?: string; description?: string; is_public?: boolean }>(req);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("title" in b) {
    patch.title = String(b.title ?? "").trim().slice(0, 80);
    if (!patch.title) throw new ApiError(400, "Give the collection a name");
  }
  if ("description" in b) patch.description = String(b.description ?? "").trim().slice(0, 2000);
  if ("is_public" in b) patch.is_public = !!b.is_public;
  await guardPost(userId, "collection", { names: [patch.title as string], texts: [patch.description as string] });
  const { data } = await createAdminClient().from("collections").update(patch).eq("id", c.id).select().single();
  return data;
});

/** DELETE — remove the collection (the projects in it aren't touched). */
export const DELETE = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const c = await ownedCollection(userId, (await params).id);
  await createAdminClient().from("collections").delete().eq("id", c.id);
  return { deleted: c.id };
});

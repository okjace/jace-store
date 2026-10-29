import { ApiError, handler, readJson, requireApiUser } from "@/lib/apiAuth";
import { guardPost } from "@/lib/accountModeration";
import { isAdmin } from "@/lib/moderation";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "Comment not found");
  const { data } = await createAdminClient().from("comments").select("id, user_id, project_id, project:projects(owner_id)").eq("id", id).maybeSingle();
  if (!data) throw new ApiError(404, "Comment not found");
  return data as unknown as { id: string; user_id: string; project_id: string; project: { owner_id: string } };
}

/** PATCH { body } — edit your own comment. */
export const PATCH = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const c = await load((await params).id);
  if (c.user_id !== userId) throw new ApiError(403, "You can only edit your own comments");
  const body = String((await readJson<{ body?: string }>(req)).body ?? "").trim();
  if (!body || body.length > 4000) throw new ApiError(400, "Comments are 1-4000 characters");
  await guardPost(userId, "comment", { messages: [body] });
  const { data } = await createAdminClient().from("comments").update({ body, edited_at: new Date().toISOString() }).eq("id", c.id).select("id, body, edited_at").single();
  return data;
});

/** DELETE — the author, the project's owner or a moderator can remove a comment (and its replies). */
export const DELETE = handler(async (req, { params }: Ctx) => {
  const userId = await requireApiUser(req);
  const c = await load((await params).id);
  if (c.user_id !== userId && c.project.owner_id !== userId && !(await isAdmin(userId))) {
    throw new ApiError(403, "You can't remove this comment");
  }
  await createAdminClient().from("comments").delete().eq("id", c.id);
  return { deleted: c.id };
});

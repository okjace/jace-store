import { ApiError, handler, readJson, requireApiUser } from "@/lib/apiAuth";
import { guardPost } from "@/lib/accountModeration";
import { anyProject } from "@/lib/projectLookup";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT = "id, project_id, user_id, parent_id, body, created_at, edited_at, author:profiles(username, display_name, avatar_url)";

/** GET — a project's comments, oldest first (replies have parent_id). */
export const GET = handler(async (_req, { params }: { params: Promise<{ slug: string }> }) => {
  const project = await anyProject((await params).slug);
  const { data } = await createAdminClient().from("comments").select(SELECT).eq("project_id", project.id).order("created_at").limit(500);
  return data ?? [];
});

/** POST { body, parent_id? } — comment on a project (or reply to a comment). */
export const POST = handler(async (req, { params }: { params: Promise<{ slug: string }> }) => {
  const userId = await requireApiUser(req);
  const project = await anyProject((await params).slug);
  const b = await readJson<{ body?: string; parent_id?: string | null }>(req);
  const body = String(b.body ?? "").trim();
  if (!body) throw new ApiError(400, "Write something first");
  if (body.length > 4000) throw new ApiError(400, "Comments can be at most 4000 characters");
  const admin = createAdminClient();
  let parent: string | null = null;
  if (b.parent_id) {
    const { data: p } = await admin.from("comments").select("id, parent_id, project_id").eq("id", b.parent_id).maybeSingle();
    if (!p || p.project_id !== project.id) throw new ApiError(400, "That comment doesn't exist anymore");
    parent = p.parent_id ?? p.id;           // replies stay one level deep
  }
  await guardPost(userId, "comment", { messages: [body] });
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin.from("comments").select("id", { count: "exact", head: true }).eq("user_id", userId).gt("created_at", since);
  if ((count ?? 0) >= 6) throw new ApiError(429, "You're commenting too fast. Wait a minute.");
  const { data, error } = await admin.from("comments").insert({ project_id: project.id, user_id: userId, parent_id: parent, body }).select(SELECT).single();
  if (error) throw new ApiError(400, error.message);
  return data;
});

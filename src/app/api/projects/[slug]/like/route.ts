import { handler, readJson, requireApiUser } from "@/lib/apiAuth";
import { requireCanPost } from "@/lib/accountModeration";
import { anyProject } from "@/lib/projectLookup";
import { createAdminClient } from "@/lib/supabase/admin";

/** POST { liked: boolean } — like or unlike a project. -> { liked, likes } */
export const POST = handler(async (req, { params }: { params: Promise<{ slug: string }> }) => {
  const userId = await requireApiUser(req);
  const project = await anyProject((await params).slug);
  const { liked } = await readJson<{ liked?: boolean }>(req);
  const admin = createAdminClient();
  if (liked === false) {
    await admin.from("likes").delete().eq("user_id", userId).eq("project_id", project.id);
  } else {
    await requireCanPost(userId);
    await admin.from("likes").upsert({ user_id: userId, project_id: project.id }, { onConflict: "user_id,project_id", ignoreDuplicates: true });
  }
  const { data } = await admin.from("projects").select("likes").eq("id", project.id).single();
  return { liked: liked !== false, likes: data?.likes ?? 0 };
});

/** GET — this project's likes, and whether the caller (if signed in) likes it. -> { liked, likes } */
export const GET = handler(async (req, { params }: { params: Promise<{ slug: string }> }) => {
  const project = await anyProject((await params).slug);
  const admin = createAdminClient();
  const { data } = await admin.from("projects").select("likes").eq("id", project.id).single();
  let liked = false;
  try {
    const userId = await requireApiUser(req);
    liked = !!(await admin.from("likes").select("project_id").eq("user_id", userId).eq("project_id", project.id).maybeSingle()).data;
  } catch {
    /* not signed in */
  }
  return { liked, likes: data?.likes ?? 0 };
});

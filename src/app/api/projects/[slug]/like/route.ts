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

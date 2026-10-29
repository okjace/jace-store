import { ApiError, handler, readJson, requireApiUser } from "@/lib/apiAuth";
import { guardPost } from "@/lib/accountModeration";
import { isOwnImage } from "@/lib/images";
import { createAdminClient } from "@/lib/supabase/admin";

/** PATCH { username?, display_name?, bio?, avatar_url? } — edit your profile (moderation applies). */
export const PATCH = handler(async (req) => {
  const userId = await requireApiUser(req);
  const b = await readJson<Record<string, unknown>>(req);
  const admin = createAdminClient();
  const { data: cur } = await admin.from("profiles").select("avatar_url").eq("id", userId).single();
  const patch: Record<string, string | null> = {};
  if ("username" in b) {
    const u = String(b.username ?? "").trim();
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(u)) throw new ApiError(400, "Usernames are 3-32 letters, numbers, _ or -");
    patch.username = u;
  }
  if ("display_name" in b) patch.display_name = String(b.display_name ?? "").trim().slice(0, 60) || null;
  if ("bio" in b) patch.bio = String(b.bio ?? "").trim().slice(0, 500) || null;
  let newPicture = false;
  if ("avatar_url" in b && b.avatar_url !== cur?.avatar_url) {
    if (b.avatar_url && !isOwnImage(userId, b.avatar_url)) throw new ApiError(400, "avatar_url must be a picture you uploaded");
    patch.avatar_url = (b.avatar_url as string) || null;
    newPicture = !!b.avatar_url;
  }
  if (!Object.keys(patch).length) throw new ApiError(400, "Nothing to update");
  await guardPost(userId, "profile", { names: [patch.username, patch.display_name], texts: [patch.bio], image: newPicture ? "profile" : null });
  const { data, error } = await admin.from("profiles").update(patch).eq("id", userId).select("username, display_name, bio, avatar_url").single();
  if (error) throw new ApiError(400, error.code === "23505" ? "That username is taken." : error.message);
  return data;
});

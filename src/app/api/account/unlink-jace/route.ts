import { ApiError, handler } from "@/lib/apiAuth";
import { isPlaceholderEmail } from "@/lib/jaceOAuth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Unlink Jace, but only if the account keeps another way to sign in. */
export const POST = handler(async (req) => {
  if (req.headers.get("authorization")) throw new ApiError(403, "Use the website for this");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "Sign in first");
  const hasGithub = user.identities?.some((i) => i.provider === "github");
  const hasEmail = !!user.email && !isPlaceholderEmail(user.email);
  if (!hasGithub && !hasEmail) {
    throw new ApiError(400, "Jace is your only way to sign in. Add an email & password or link GitHub first.");
  }
  await createAdminClient().from("jace_links").delete().eq("user_id", user.id);
  return { ok: true };
});

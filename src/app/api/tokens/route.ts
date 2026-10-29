import { requireCanPost } from "@/lib/accountModeration";
import { ApiError, handler, newToken, readJson } from "@/lib/apiAuth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST { name } -> { token } (shown once). Website session only: a token can't
 * be used to mint more tokens.
 */
export const POST = handler(async (req) => {
  if (req.headers.get("authorization")) throw new ApiError(403, "Create tokens from the website");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "Sign in first");
  await requireCanPost(user.id);
  const { name } = await readJson<{ name?: string }>(req);
  const label = String(name ?? "").trim().slice(0, 64) || "CLI";
  const admin = createAdminClient();
  const { count } = await admin.from("api_tokens").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= 20) throw new ApiError(400, "You already have 20 tokens. Revoke one first.");
  const t = newToken();
  const { error } = await admin.from("api_tokens").insert({ user_id: user.id, name: label, token_hash: t.hash, prefix: t.prefix });
  if (error) throw new ApiError(400, error.message);
  return { token: t.token, name: label };
});

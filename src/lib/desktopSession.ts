import { newToken } from "./apiAuth";
import { createAdminClient } from "./supabase/admin";

export const DESKTOP_TOKEN_NAME = "Jace Store desktop app";

/**
 * The desktop app's sign-in: a personal API token (like the CLI's) the app keeps and sends as
 * "Authorization: Bearer". Signing in again replaces the previous desktop token, so they don't
 * pile up; it can be revoked any time on the website's CLI & API tokens page.
 */
export async function issueDesktopToken(userId: string, how: "jace-os" | "browser") {
  const admin = createAdminClient();
  await admin.from("api_tokens").delete().eq("user_id", userId).like("name", `${DESKTOP_TOKEN_NAME}%`);
  const t = newToken();
  const name = `${DESKTOP_TOKEN_NAME} (${how === "jace-os" ? "Jace OS" : "browser sign-in"})`;
  const { error } = await admin.from("api_tokens").insert({ user_id: userId, name, token_hash: t.hash, prefix: t.prefix });
  if (error) throw new Error(error.message);
  const { data: profile } = await admin.from("profiles").select("username, display_name, avatar_url").eq("id", userId).single();
  return { token: t.token, user: profile };
}

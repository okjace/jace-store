import { ApiError, handler, hashToken } from "@/lib/apiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

/** DELETE — sign out: revokes the token this request was made with (the desktop app's "Sign out"). */
export const DELETE = handler(async (req) => {
  const bearer = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!bearer) throw new ApiError(400, "Send the token to revoke as Authorization: Bearer");
  await createAdminClient().from("api_tokens").delete().eq("token_hash", hashToken(bearer));
  return { signed_out: true };
});

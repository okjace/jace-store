import { ApiError, handler, readJson } from "@/lib/apiAuth";
import { accountToken, forgetAccount, refreshJaceToken, saveToken } from "@/lib/jaceDevice";
import { fetchUserinfo, signInWithJace } from "@/lib/jaceSignIn";

/**
 * POST { jace_id, next? }: switch to another account remembered on this device, with its own Jace
 * token. -> { ok } | { reauth: url } (token expired or revoked: sign it in again) | { removed, message } (banned)
 */
export const POST = handler(async (req) => {
  const { jace_id, next } = await readJson<{ jace_id?: string; next?: string }>(req);
  const back = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const reauth = { reauth: `/api/auth/jace/start?add=1&next=${encodeURIComponent(back)}` };
  const acct = await accountToken(String(jace_id ?? ""));
  if (!acct) throw new ApiError(404, "That account isn't on this device any more");
  if (!acct.token?.access_token) return reauth;

  let token = acct.token;
  let info = await fetchUserinfo(token.access_token);
  if (info.status === "unauthorized") {
    const fresh = await refreshJaceToken(token);
    if (!fresh) return reauth;
    token = fresh;
    await saveToken(acct.jace_id, token);
    info = await fetchUserinfo(token.access_token);
  }
  if (info.status === "unauthorized") return reauth;
  if (info.status === "banned") {
    await forgetAccount(acct.jace_id);
    return { removed: acct.jace_id, message: `@${acct.username ?? "that account"} is banned on Jace, so it was removed from this device.` };
  }
  if (info.status === "error") throw new ApiError(502, info.message);
  if (info.jace.id !== acct.jace_id) return reauth;
  const done = await signInWithJace(info.jace, token);
  if ("error" in done) throw new ApiError(500, done.error);
  return { ok: true };
});

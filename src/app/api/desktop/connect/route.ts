import { ApiError, handler, readJson } from "@/lib/apiAuth";
import { currentState, restriction } from "@/lib/accountModeration";
import { issueDesktopToken } from "@/lib/desktopSession";
import { createClient } from "@/lib/supabase/server";

/**
 * POST — the website side of the desktop app's normal sign-in (/desktop/connect): the person is
 * signed in on the website and clicked Connect; returns a desktop session token for the app.
 */
export const POST = handler(async (req) => {
  if (req.headers.get("authorization")) throw new ApiError(403, "Connect from the website");
  await readJson(req).catch(() => ({}));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "Sign in first");
  const r = restriction(await currentState(user.id).catch(() => null));
  if (r?.kind === "banned") throw new ApiError(403, r.message);
  return await issueDesktopToken(user.id, "browser");
});

import { ApiError, handler } from "@/lib/apiAuth";
import { forgetAccount, listAccounts, markSignedOut } from "@/lib/jaceDevice";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function currentJaceId(): Promise<string | null> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return null;
  const { data } = await createAdminClient().from("jace_links").select("jace_id").eq("user_id", user.id).maybeSingle();
  return data?.jace_id ?? null;
}

/** GET: the Jace accounts that signed in on this device (current one first). Never includes tokens. */
export const GET = handler(async () => {
  const [all, current] = await Promise.all([listAccounts(), currentJaceId()]);
  const accounts = all.map((a) => ({
    jace_id: a.jace_id, username: a.username, display_name: a.display_name, picture: a.picture, current: a.jace_id === current,
  }));
  accounts.sort((a, b) => Number(b.current) - Number(a.current));
  return { accounts };
});

/** DELETE ?jace_id=…: forget an account on this device (signing out if it's the current one). */
export const DELETE = handler(async (req) => {
  const jaceId = new URL(req.url).searchParams.get("jace_id") ?? "";
  if (!jaceId) throw new ApiError(400, "jace_id is required");
  const wasCurrent = (await currentJaceId()) === jaceId;
  await forgetAccount(jaceId);
  if (wasCurrent) {
    await (await createClient()).auth.signOut();
    await markSignedOut(true);
  }
  return { removed: jaceId, signed_out: wasCurrent };
});

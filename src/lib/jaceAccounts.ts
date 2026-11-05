import { createAdminClient } from "./supabase/admin";
import { jaceLoginEmail, type JaceUser } from "./jaceOAuth";

/**
 * The Jace Store account for a Jace account: the one it's linked to (jace_links), or a new one.
 * Used by "Sign in with Jace" in the browser and by the desktop app's Jace OS sign-in.
 */
export async function jaceStoreUserFor(jace: JaceUser): Promise<string | null> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("jace_links").select("user_id").eq("jace_id", jace.id).maybeSingle();
  return existing?.user_id ?? (await createJaceUser(admin, jace));
}

/**
 * New Jace user: create a store account with a placeholder login email derived
 * from the Jace id (never the real email), so a Jace login can't take over an
 * existing email/GitHub account. No mail is ever sent to this address.
 */
async function createJaceUser(admin: ReturnType<typeof createAdminClient>, jace: JaceUser) {
  const loginEmail = jaceLoginEmail(jace.id);
  let userId: string | undefined;
  const created = await admin.auth.admin.createUser({
    email: loginEmail,
    email_confirm: true,
    user_metadata: {
      provider: "jace",
      jace_id: jace.id,
      username: jace.username ?? undefined,
      full_name: jace.name ?? jace.username ?? undefined,
      avatar_url: jace.avatarUrl ?? undefined,
      contact_email: jace.email ?? undefined,
    },
  });
  if (created.data.user) {
    userId = created.data.user.id;
  } else if (/already/i.test(created.error?.message ?? "")) {
    // Placeholder account exists but its link row is missing: find it.
    for (let page = 1; page <= 50 && !userId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      userId = data.users.find((u) => u.email === loginEmail)?.id;
      if (data.users.length < 200) break;
    }
  }
  if (!userId) return null;
  await admin.from("jace_links").upsert({ jace_id: jace.id, user_id: userId, jace_username: jace.username }, { onConflict: "jace_id" });
  return userId;
}

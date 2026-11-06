import { createClient } from "@/lib/supabase/server";
import { blockedHandle, currentState, restriction } from "@/lib/accountModeration";

/** Shown on every page while your account is banned or muted (here or on Jace). */
export default async function AccountNotice() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const r = restriction(await currentState(user.id).catch(() => null));
  if (!r) {
    const { data: me } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
    const badHandle = me ? await blockedHandle(me.username, user.id).catch(() => null) : null;
    if (badHandle) {
      return (
        <div className="border-b border-amber-300/40 bg-amber-300/10 px-4 py-3 text-center text-sm text-amber-100">
          {badHandle} <a href="/settings" className="font-semibold underline">Change it</a>
        </div>
      );
    }
    // Jace is the only way to sign in: accounts from before that need a Jace account linked
    const { data: link } = await supabase.from("jace_links").select("jace_id").eq("user_id", user.id).maybeSingle();
    if (link) return null;
    return (
      <div className="border-b border-amber-300/40 bg-amber-300/10 px-4 py-3 text-center text-sm text-amber-100">
        Jace is now the only way to sign in to Jace Store. <a href="/api/auth/jace/start?mode=link&next=/settings" className="font-semibold underline">Link your Jace account</a>{" "}
        now, or you won&apos;t be able to sign in again after you sign out.
      </div>
    );
  }
  const banned = r.kind === "banned";
  return (
    <div className={`border-b px-4 py-3 text-center text-sm ${banned ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-amber-300/40 bg-amber-300/10 text-amber-100"}`}>
      {r.message}
      {banned && " You can still browse and download, but you can't post anything."}
      {" "}Banned or muted on Jace? Appeal by messaging Jace Official on{" "}
      <a href="https://jaceo.vercel.app" className="underline">Jace</a>.
    </div>
  );
}

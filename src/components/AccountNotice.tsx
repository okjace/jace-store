import { createClient } from "@/lib/supabase/server";
import { currentState, restriction } from "@/lib/accountModeration";

/** Shown on every page while your account is banned or muted (here or on Jace). */
export default async function AccountNotice() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const r = restriction(await currentState(user.id).catch(() => null));
  if (!r) return null;
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

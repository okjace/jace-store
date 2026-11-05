import Link from "next/link";
import { requireUser } from "@/lib/requireUser";
import type { Profile } from "@/lib/types";
import ProfileSettings from "@/components/settings/ProfileSettings";
import DeleteAccount from "@/components/settings/DeleteAccount";

export const metadata = { title: "Account settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ linked?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/settings");
  const [{ data: profile }, { data: jace }, { count: projectCount }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("jace_links").select("jace_username").eq("user_id", user.id).maybeSingle(),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted hover:text-text">← Dashboard</Link>
        <h1 className="mt-2 text-3xl font-black">Account settings</h1>
      </div>
      {profile && <ProfileSettings profile={profile as Profile} />}
      <section id="sign-in" className="card scroll-mt-24 space-y-3 p-6">
        <h2 className="text-lg font-bold">Signing in</h2>
        {jace ? (
          <p className="text-sm">
            You sign in with your Jace account{jace.jace_username ? <> <b>@{jace.jace_username}</b></> : null}. Jace is the only way to sign in to Jace Store.
          </p>
        ) : (
          <>
            <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">
              Jace is now the only way to sign in to Jace Store, and this account isn&apos;t linked to a Jace account yet.
              Link one now, or you won&apos;t be able to sign in again after you sign out.
            </p>
            <a href="/api/auth/jace/start?mode=link&next=/settings" className="btn-primary">Link Jace</a>
          </>
        )}
        {sp.linked === "jace" && <p className="text-sm text-brand">Jace connected.</p>}
        {sp.error && <p className="text-sm text-red-300">{sp.error}</p>}
      </section>
      <div className="card p-6 text-sm">
        <h2 className="text-lg font-bold">Developer</h2>
        <p className="mt-1 text-muted">Publish from scripts, CI or an AI assistant.</p>
        <Link href="/dashboard/tokens" className="btn-ghost mt-3">CLI & API tokens</Link>
      </div>
      {profile && <DeleteAccount username={profile.username} projectCount={projectCount ?? 0} />}
    </div>
  );
}

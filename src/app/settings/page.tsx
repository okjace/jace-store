import Link from "next/link";
import { requireUser } from "@/lib/requireUser";
import type { Profile } from "@/lib/types";
import ProfileSettings from "@/components/settings/ProfileSettings";
import DeleteAccount from "@/components/settings/DeleteAccount";
import UseJaceHandle from "@/components/settings/UseJaceHandle";
import { currentJaceUsername } from "@/lib/accountModeration";
import { createAdminClient } from "@/lib/supabase/admin";
import PaymentSettings, { type PurchaseRow } from "@/components/settings/PaymentSettings";
import SellingSettings, { type SaleRow } from "@/components/settings/SellingSettings";
import { paymentsReady, refreshSeller } from "@/lib/payments";

export const metadata = { title: "Account settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ linked?: string; error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/settings");
  const [{ data: profile }, { data: jace }, { count: projectCount }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("jace_links").select("jace_id, jace_username").eq("user_id", user.id).maybeSingle(),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
  ]);

  // the Jace username right now (they may have renamed on Jace); keep Jace Store's copy fresh
  let jaceName = jace?.jace_username ?? null;
  if (jace) {
    const live = await currentJaceUsername(jace.jace_id).catch(() => null);
    if (live && live !== jaceName) {
      await createAdminClient().from("jace_links").update({ jace_username: live }).eq("jace_id", jace.jace_id);
      jaceName = live;
    }
  }
  // payments (migration 014): what I bought, and what I sold
  const admin = createAdminClient();
  const available = paymentsReady();
  const [{ data: bought }, { data: sold }, seller] = await Promise.all([
    admin.from("purchases").select("*, project:projects(slug, title)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    admin.from("purchases").select("*, project:projects!inner(slug, title, owner_id), buyer:profiles(username)")
      .eq("project.owner_id", user.id).order("created_at", { ascending: false }).limit(100),
    available ? refreshSeller(user.id).catch(() => null) : Promise.resolve(null),
  ]);
  const handleDiffers = !!jaceName && profile && jaceName.toLowerCase() !== String(profile.username).toLowerCase();

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
          <>
            <p className="text-sm">
              You sign in with your Jace account{jaceName ? <> <b>@{jaceName}</b></> : null}. Jace is the only way to sign in to Jace Store.
            </p>
            {handleDiffers && (
              <p className="text-sm text-muted">Your Jace Store handle is <b className="text-text">@{profile.username}</b>, which isn&apos;t your Jace username.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {handleDiffers && <UseJaceHandle jaceUsername={jaceName!} />}
              <a href="/api/auth/jace/start?mode=link&next=/settings" className="btn-ghost" title="Changed your username on Jace? Bring it over">Update from Jace</a>
            </div>
          </>
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
      <PaymentSettings purchases={(bought ?? []) as PurchaseRow[]} saved={sp.saved === "1"} />
      <SellingSettings available={available} connected={!!seller?.account_id} ready={!!seller?.charges_enabled}
        payouts={!!seller?.payouts_enabled} sales={(sold ?? []) as SaleRow[]} />
      <div className="card p-6 text-sm">
        <h2 className="text-lg font-bold">Developer</h2>
        <p className="mt-1 text-muted">Publish from scripts, CI or an AI assistant.</p>
        <Link href="/dashboard/tokens" className="btn-ghost mt-3">CLI & API tokens</Link>
      </div>
      {profile && <DeleteAccount username={profile.username} projectCount={projectCount ?? 0} />}
    </div>
  );
}

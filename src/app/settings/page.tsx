import Link from "next/link";
import { requireUser } from "@/lib/requireUser";
import { isPlaceholderEmail } from "@/lib/jaceOAuth";
import type { Profile } from "@/lib/types";
import ProfileSettings from "@/components/settings/ProfileSettings";
import EmailPassword from "@/components/settings/EmailPassword";
import SignInMethods from "@/components/settings/SignInMethods";

export const metadata = { title: "Account settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ linked?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/settings");
  const [{ data: profile }, { data: jace }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("jace_links").select("jace_username").eq("user_id", user.id).maybeSingle(),
  ]);
  const github = user.identities?.find((i) => i.provider === "github") ?? null;
  const gd = github?.identity_data as Record<string, string> | undefined;
  const placeholder = isPlaceholderEmail(user.email);
  const notice = sp.linked === "github" ? "GitHub connected." : sp.linked === "jace" ? "Jace connected." : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted hover:text-text">← Dashboard</Link>
        <h1 className="mt-2 text-3xl font-black">Account settings</h1>
      </div>
      {profile && <ProfileSettings profile={profile as Profile} />}
      <SignInMethods
        github={github}
        githubName={gd?.user_name ?? gd?.preferred_username ?? gd?.name ?? null}
        jaceLinked={!!jace}
        jaceUsername={jace?.jace_username ?? null}
        hasEmail={!!user.email && !placeholder}
        email={placeholder ? null : user.email ?? null}
        notice={notice}
        error={sp.error ?? null}
      />
      <EmailPassword email={placeholder ? null : user.email ?? null} placeholder={placeholder} />
      <div className="card p-6 text-sm">
        <h2 className="text-lg font-bold">Developer</h2>
        <p className="mt-1 text-muted">Publish from scripts, CI or an AI assistant.</p>
        <Link href="/dashboard/tokens" className="btn-ghost mt-3">CLI & API tokens</Link>
      </div>
    </div>
  );
}

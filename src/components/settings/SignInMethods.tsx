"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserIdentity } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

interface Props {
  github: UserIdentity | null;
  githubName: string | null;
  jaceUsername: string | null;
  jaceLinked: boolean;
  hasEmail: boolean;
  email: string | null;
  notice: string | null;
  error: string | null;
}

export default function SignInMethods(p: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(
    p.error ? { ok: false, text: p.error } : p.notice ? { ok: true, text: p.notice } : null
  );
  const [busy, setBusy] = useState<string | null>(null);
  const methods = Number(!!p.github) + Number(p.jaceLinked) + Number(p.hasEmail);

  async function linkGithub() {
    setBusy("github");
    const { error } = await createClient().auth.linkIdentity({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/settings?linked=github#sign-in")}` },
    });
    if (error) {
      setBusy(null);
      setMsg({
        ok: false,
        text: /manual linking/i.test(error.message)
          ? "Account linking is turned off in Supabase (Authentication → Sign In / Providers → Allow manual linking)."
          : error.message,
      });
    }
  }

  async function unlinkGithub() {
    if (!p.github || !confirm("Unlink GitHub? You won't be able to sign in with it anymore.")) return;
    setBusy("github");
    const { error } = await createClient().auth.unlinkIdentity(p.github);
    setBusy(null);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: "GitHub unlinked." });
    router.refresh();
  }

  async function unlinkJace() {
    if (!confirm("Unlink Jace? You won't be able to sign in with it anymore.")) return;
    setBusy("jace");
    const res = await fetch("/api/account/unlink-jace", { method: "POST" });
    const out = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setMsg({ ok: false, text: out.error ?? res.statusText });
    setMsg({ ok: true, text: "Jace unlinked." });
    router.refresh();
  }

  const rows: { id: string; name: string; detail: string; linked: boolean; onLink?: () => void; onUnlink?: () => void }[] = [
    {
      id: "email", name: "Email & password", linked: p.hasEmail,
      detail: p.hasEmail ? `${p.email}. Set a password below if you haven't.` : "Add an email below to enable it.",
    },
    {
      id: "github", name: "GitHub", linked: !!p.github,
      detail: p.github ? `Connected as ${p.githubName ?? "your GitHub account"}` : "Sign in with your GitHub account",
      onLink: linkGithub, onUnlink: unlinkGithub,
    },
    {
      id: "jace", name: "Jace", linked: p.jaceLinked,
      detail: p.jaceLinked ? `Jace account${p.jaceUsername ? ` @${p.jaceUsername}` : ""}` : "Sign in with your Jace account",
      onLink: () => { setBusy("jace"); window.location.href = "/api/auth/jace/start?mode=link&next=/settings"; },
      onUnlink: unlinkJace,
    },
  ];

  return (
    <div id="sign-in" className="scroll-mt-24 space-y-3">
      <div>
        <h2 className="text-lg font-bold">Sign-in methods</h2>
        <p className="text-sm text-muted">Connect several so you can sign in to this same account with any of them.</p>
      </div>
      <div className="card divide-y divide-line">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-4 p-4">
            <div className="flex-1">
              <div className="font-semibold">{r.name} {r.linked && <span className="chip chip-on ml-1">connected</span>}</div>
              <div className="text-sm text-muted">{r.detail}</div>
            </div>
            {r.linked
              ? r.onUnlink && (
                  <button onClick={r.onUnlink} disabled={busy === r.id || methods < 2} className="btn-ghost text-sm"
                    title={methods < 2 ? "Add another sign-in method first" : undefined}>Unlink</button>
                )
              : r.onLink && <button onClick={r.onLink} disabled={busy === r.id} className="btn-primary text-sm">Connect</button>}
          </div>
        ))}
      </div>
      {methods < 2 && <p className="text-xs text-muted">You can unlink a method once you have at least two.</p>}
      {msg && <p className={`text-sm ${msg.ok ? "text-brand" : "text-red-300"}`}>{msg.text}</p>}
    </div>
  );
}

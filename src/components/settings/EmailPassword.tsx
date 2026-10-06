"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function EmailPassword({ email, placeholder }: { email: string | null; placeholder: boolean }) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setMsg(null);
    const { error } = await createClient().auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/settings` }
    );
    setBusy(null);
    setMsg(error ? { ok: false, text: error.message } : {
      ok: true,
      text: placeholder
        ? `Check ${newEmail} for a confirmation link.`
        : `Confirmation links were sent to ${newEmail}${email ? ` and ${email}` : ""}. Click both to finish.`,
    });
    if (!error) setNewEmail("");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setMsg({ ok: false, text: "Passwords don't match." });
    setBusy("password");
    setMsg(null);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(null);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Password updated. You can now sign in with your email and password." });
    if (!error) { setPassword(""); setConfirm(""); }
  }

  return (
    <div id="password" className="card scroll-mt-24 space-y-5 p-6">
      <h2 className="text-lg font-bold">Email & password</h2>
      <form onSubmit={changeEmail} className="space-y-2">
        <label className="label" htmlFor="email">Email</label>
        <p className="text-sm">
          {placeholder || !email ? <span className="text-muted">No email yet. Add one to sign in with email & password.</span> : <b>{email}</b>}
        </p>
        <div className="flex flex-wrap gap-2">
          <input id="email" type="email" required className="input min-w-0 flex-1" placeholder={placeholder ? "you@example.com" : "New email"}
            value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" />
          <button disabled={busy === "email"} className="btn-ghost">{placeholder ? "Add email" : "Change email"}</button>
        </div>
      </form>
      <form onSubmit={changePassword} className="space-y-2">
        <span className="label">{placeholder ? "Password (add and confirm an email first)" : "Set or change password"}</span>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input type="password" required minLength={8} className="input" placeholder="New password" autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)} disabled={placeholder} />
          <input type="password" required minLength={8} className="input" placeholder="Confirm" autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={placeholder} />
          <button disabled={busy === "password" || placeholder} className="btn-ghost">Save password</button>
        </div>
      </form>
      {msg && <p className={`text-sm ${msg.ok ? "text-brand" : "text-red-300"}`}>{msg.text}</p>}
    </div>
  );
}

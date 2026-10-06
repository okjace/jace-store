"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(params.get("error"));
  const supabase = createClient();
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "signup" && !data.session) return setMsg("Check your email to confirm your account.");
    router.push(next);
    router.refresh();
  }

  async function oauth(provider: "github" | "discord" | "google") {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
    if (error) setMsg(error.message);
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="card p-6">
        <h1 className="mb-4 text-2xl font-black">{mode === "signin" ? "Sign in" : "Create account"}</h1>
        <div className="space-y-2">
          <button onClick={() => oauth("github")} className="btn-ghost w-full">Continue with GitHub</button>
          <button onClick={() => oauth("discord")} className="btn-ghost w-full">Continue with Discord</button>
        </div>
        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <div className="h-px flex-1 bg-line" />or<div className="h-px flex-1 bg-line" />
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="pw">Password</label>
            <input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input" autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          </div>
          {msg && <p className="text-sm text-amber-300">{msg}</p>}
          <button disabled={busy} className="btn-primary w-full">{busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}</button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          {mode === "signin" ? "New here? " : "Have an account? "}
          <button className="text-brand underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}

import Link from "next/link";
import { SITE_NAME } from "@/lib/constants";

export const metadata = { title: "Sign in" };

/** Jace is the only way to sign in to Jace Store. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: nextParam, error } = await searchParams;
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  return (
    <div className="mx-auto max-w-sm">
      <div className="card space-y-5 p-6 text-center">
        <h1 className="text-2xl font-black">Sign in to {SITE_NAME}</h1>
        <p className="text-sm text-muted">Jace Store uses your Jace account. New here? Signing in makes your Jace Store account.</p>
        {error && <p className="text-sm text-amber-300">{error}</p>}
        <a href={`/api/auth/jace/start?next=${encodeURIComponent(next)}`} className="btn-primary w-full py-3! text-base">Continue with Jace</a>
        <p className="text-xs text-muted">
          No Jace account? <a href="https://jaceo.vercel.app" className="underline hover:text-text">Make one on Jace</a>.
          Made your Jace Store account with email or GitHub? Sign in with a Jace account that has the same (verified) email,
          and you&apos;ll get your Jace Store account back. <Link href="/desktop" className="underline hover:text-text">Desktop app</Link>
        </p>
      </div>
    </div>
  );
}

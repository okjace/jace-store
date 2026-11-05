import { requireUser } from "@/lib/requireUser";
import ConnectDesktop from "@/components/ConnectDesktop";

export const metadata = { title: "Connect the desktop app" };

/** The desktop app's normal sign-in: it opens this page with a local port and a one-time state. */
export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ port?: string; state?: string }> }) {
  const { port, state } = await searchParams;
  const p = Number(port);
  const ok = Number.isInteger(p) && p >= 1024 && p <= 65535 && /^[a-f0-9]{16,64}$/.test(state ?? "");
  const { supabase, user } = await requireUser(`/desktop/connect?port=${encodeURIComponent(port ?? "")}&state=${encodeURIComponent(state ?? "")}`);
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
  return (
    <div className="mx-auto max-w-md">
      <div className="card space-y-4 p-6 text-center">
        <h1 className="text-2xl font-black">Connect the Jace Store app</h1>
        {ok ? (
          <ConnectDesktop port={p} state={state!} username={profile?.username ?? ""} />
        ) : (
          <p className="text-sm text-muted">This link is incomplete. Click Sign in in the Jace Store app again.</p>
        )}
      </div>
    </div>
  );
}

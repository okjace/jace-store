import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GROUPS, SITE_NAME } from "@/lib/constants";
import PackCount from "./PackCount";

export default async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let username: string | null = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("username").eq("id", user.id).single();
    username = data?.username ?? null;
  }
  const sections = GROUPS.filter((g) => g.id !== "other");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-black">J</span>
          <span className="hidden sm:inline">{SITE_NAME}</span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 text-sm md:flex">
          {sections.map((g) => (
            <Link key={g.id} href={`/browse?group=${g.id}`} className="rounded-md px-3 py-1.5 text-muted hover:bg-panel-2 hover:text-text">
              {g.label}
            </Link>
          ))}
          <Link href="/browse" className="rounded-md px-3 py-1.5 text-muted hover:bg-panel-2 hover:text-text">Everything</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/pack" className="btn-ghost hidden px-3! sm:inline-flex" title="Minecraft pack builder">
            Pack <PackCount />
          </Link>
          {user ? (
            <>
              <Link href="/new" className="btn-primary">Upload</Link>
              <Link href="/dashboard" className="btn-ghost">{username ?? "Dashboard"}</Link>
            </>
          ) : (
            <Link href="/login" className="btn-primary">Sign in</Link>
          )}
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line px-4 py-2 text-sm md:hidden">
        {sections.map((g) => (
          <Link key={g.id} href={`/browse?group=${g.id}`} className="shrink-0 rounded-md px-2.5 py-1 text-muted hover:text-text">{g.label}</Link>
        ))}
        <Link href="/browse" className="shrink-0 rounded-md px-2.5 py-1 text-muted hover:text-text">Everything</Link>
      </nav>
    </header>
  );
}

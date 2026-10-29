import Link from "next/link";
import { requireUser } from "@/lib/requireUser";
import { timeAgo } from "@/lib/constants";
import NewCollection from "@/components/NewCollection";

export const metadata = { title: "Your collections" };

export default async function CollectionsPage() {
  const { supabase, user } = await requireUser("/collections");
  const { data } = await supabase.from("collections").select("id, title, description, is_public, updated_at, collection_items(project_id)")
    .eq("owner_id", user.id).order("updated_at", { ascending: false });
  const list = (data ?? []) as { id: string; title: string; description: string; is_public: boolean; updated_at: string; collection_items: unknown[] }[];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-muted hover:text-text">← Dashboard</Link>
        <h1 className="mt-2 text-3xl font-black">Your collections</h1>
        <p className="mt-1 text-muted">Group projects you like: a modpack wishlist, your favourite tools, apps for a new PC. Use ☆ Save on any project.</p>
      </div>
      <NewCollection />
      <div className="card divide-y divide-line">
        {list.map((c) => (
          <Link key={c.id} href={`/collection/${c.id}`} className="flex items-center gap-4 p-4 hover:bg-panel-2">
            <div className="min-w-0 flex-1">
              <div className="font-bold">{c.title} {!c.is_public && <span className="chip ml-1">🔒 private</span>}</div>
              {c.description && <p className="truncate text-sm text-muted">{c.description}</p>}
            </div>
            <span className="shrink-0 text-sm text-muted">{c.collection_items.length} projects · {timeAgo(c.updated_at)}</span>
          </Link>
        ))}
        {list.length === 0 && <p className="p-6 text-center text-muted">No collections yet.</p>}
      </div>
    </div>
  );
}

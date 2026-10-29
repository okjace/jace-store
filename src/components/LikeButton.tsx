"use client";
import { useState } from "react";
import { formatNumber } from "@/lib/constants";

export default function LikeButton({ slug, liked: initialLiked, likes: initialLikes, signedIn, loginHref }: {
  slug: string; liked: boolean; likes: number; signedIn: boolean; loginHref: string;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [likes, setLikes] = useState(initialLikes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!signedIn) {
      window.location.href = loginHref;
      return;
    }
    setBusy(true);
    setError(null);
    const want = !liked;
    setLiked(want);                      // feels instant; undone if the server says no
    setLikes((n) => n + (want ? 1 : -1));
    const res = await fetch(`/api/projects/${slug}/like`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ liked: want }) });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setLiked(!want);
      setLikes((n) => n + (want ? -1 : 1));
      setError(out.error ?? "Couldn't save that");
      return;
    }
    setLiked(out.liked);
    setLikes(out.likes);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={liked}
        className={`btn-ghost ${liked ? "border-pink-400/60! text-pink-300" : ""}`} title={liked ? "Unlike" : "Like"}>
        <span aria-hidden>{liked ? "♥" : "♡"}</span> {formatNumber(likes)}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  );
}

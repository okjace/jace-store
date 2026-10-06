"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeFilename, uploadToBucket } from "@/lib/upload";
import type { Profile } from "@/lib/types";

export default function ProfileSettings({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState(profile.avatar_url);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    try {
      let avatar_url = profile.avatar_url;
      if (avatar) {
        const ext = safeFilename(avatar.name.split(".").pop()?.toLowerCase() || "png");
        avatar_url = await uploadToBucket(supabase, "icons", `${profile.id}/avatar-${Date.now()}.${ext}`, avatar);
      }
      const { error } = await supabase
        .from("profiles")
        .update({ username, display_name: displayName || null, bio: bio || null, avatar_url })
        .eq("id", profile.id);
      if (error) throw new Error(error.code === "23505" ? "That username is taken." : error.message);
      setAvatar(null);
      setMsg({ ok: true, text: "Profile saved." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-6">
      <h2 className="text-lg font-bold">Profile</h2>
      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-20 w-20 rounded-full border border-line object-cover" />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-full bg-panel-2 text-3xl font-black">{username[0]?.toUpperCase()}</div>
        )}
        <label className="btn-ghost cursor-pointer">
          Change picture
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 2 * 1024 * 1024) return setMsg({ ok: false, text: "Picture must be under 2 MB" });
              setAvatar(f);
              setPreview(URL.createObjectURL(f));
            }} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="un">Username</label>
          <input id="un" className="input" required pattern="[a-zA-Z0-9_-]{3,32}" title="3-32 letters, numbers, _ or -"
            value={username} onChange={(e) => setUsername(e.target.value)} />
          <p className="mt-1 text-xs text-muted">Your profile is at /user/{username || "…"}</p>
        </div>
        <div>
          <label className="label" htmlFor="dn">Display name</label>
          <input id="dn" className="input" maxLength={60} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="bio">Bio</label>
        <textarea id="bio" rows={3} maxLength={500} className="input" value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>
      <div className="flex items-center gap-3">
        <button disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save profile"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-brand" : "text-red-300"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

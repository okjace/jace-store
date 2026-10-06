"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export default function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createClient()
      .from("profiles")
      .update({ username, display_name: displayName || null, bio: bio || null })
      .eq("id", profile.id);
    setMsg(error ? (error.code === "23505" ? "Username taken." : error.message) : "Saved.");
    if (!error) router.refresh();
  }

  return (
    <form onSubmit={save} className="card space-y-3 p-5">
      <h2 className="font-bold">Profile</h2>
      <div>
        <label className="label" htmlFor="un">Username</label>
        <input id="un" className="input" required pattern="[a-zA-Z0-9_-]{3,32}" value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="dn">Display name</label>
        <input id="dn" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="bio">Bio</label>
        <textarea id="bio" rows={3} className="input" value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>
      {msg && <p className="text-sm text-muted">{msg}</p>}
      <button className="btn-primary">Save profile</button>
    </form>
  );
}

"use client";
import Link from "next/link";
import { useState } from "react";
import { timeAgo } from "@/lib/constants";
import ReportButton from "./ReportButton";

export interface CommentRow {
  id: string; user_id: string; parent_id: string | null; body: string; created_at: string; edited_at: string | null;
  author: { username: string; display_name: string | null; avatar_url: string | null } | null;
}

interface Props {
  projectId: string; slug: string; title: string; initial: CommentRow[];
  me: string | null; ownerId: string; moderator: boolean; notice: string | null; loginHref: string;
}

export default function Comments(p: Props) {
  const [comments, setComments] = useState(p.initial);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(out.error ?? res.statusText);
      return null;
    }
    return out;
  }

  async function post(body: string, parent: string | null) {
    const c = await call(`/api/projects/${p.slug}/comments`, "POST", { body, parent_id: parent });
    if (!c) return false;
    setComments((cs) => [...cs, c]);
    return true;
  }

  async function remove(c: CommentRow) {
    if (!confirm("Remove this comment" + (c.parent_id ? "?" : " and its replies?"))) return;
    if (await call(`/api/comments/${c.id}`, "DELETE")) setComments((cs) => cs.filter((x) => x.id !== c.id && x.parent_id !== c.id));
  }

  async function saveEdit(c: CommentRow) {
    const out = await call(`/api/comments/${c.id}`, "PATCH", { body: editText });
    if (!out) return;
    setComments((cs) => cs.map((x) => (x.id === c.id ? { ...x, body: out.body, edited_at: out.edited_at } : x)));
    setEditing(null);
  }

  const top = comments.filter((c) => !c.parent_id);
  const replies = (id: string) => comments.filter((c) => c.parent_id === id);

  const one = (c: CommentRow, isReply = false) => {
    const mine = p.me === c.user_id;
    const canRemove = mine || p.me === p.ownerId || p.moderator;
    const name = c.author?.display_name || c.author?.username || "deleted user";
    return (
      <div key={c.id} className={`flex gap-3 ${isReply ? "mt-3 ml-11" : ""}`}>
        {c.author?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.author.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full border border-line object-cover" />
        ) : (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-panel-2 text-sm font-bold">{name[0]?.toUpperCase()}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
            {c.author ? <Link href={`/user/${c.author.username}`} className="font-semibold hover:underline">{name}</Link> : <b>{name}</b>}
            {c.user_id === p.ownerId && <span className="chip chip-on py-0!">creator</span>}
            <span className="text-xs text-muted">{timeAgo(c.created_at)}{c.edited_at ? " · edited" : ""}</span>
          </div>
          {editing === c.id ? (
            <div className="mt-1 space-y-2">
              <textarea className="input" rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={4000} />
              <div className="flex gap-2">
                <button className="btn-primary px-3! py-1! text-xs" disabled={busy} onClick={() => saveEdit(c)}>Save</button>
                <button className="btn-ghost px-3! py-1! text-xs" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 text-sm whitespace-pre-wrap break-words">{c.body}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
            {p.me && !isReply && !p.notice && <button className="hover:text-text" onClick={() => { setReplyTo(c.id); setReplyText(""); }}>Reply</button>}
            {mine && editing !== c.id && <button className="hover:text-text" onClick={() => { setEditing(c.id); setEditText(c.body); }}>Edit</button>}
            {canRemove && <button className="hover:text-red-300" onClick={() => remove(c)}>Remove</button>}
            {!mine && (
              <ReportButton projectId={p.projectId} projectTitle={p.title} commentId={c.id} signedIn={!!p.me} loginHref={p.loginHref} label="Report" />
            )}
          </div>
          {replies(c.id).map((r) => one(r, true))}
          {replyTo === c.id && (
            <form className="mt-3 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await post(replyText, c.id)) setReplyTo(null); }}>
              <textarea className="input" rows={2} autoFocus placeholder={`Reply to ${name}…`} value={replyText} onChange={(e) => setReplyText(e.target.value)} maxLength={4000} />
              <div className="flex gap-2">
                <button className="btn-primary px-3! py-1! text-xs" disabled={busy || !replyText.trim()}>Reply</button>
                <button type="button" className="btn-ghost px-3! py-1! text-xs" onClick={() => setReplyTo(null)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  };

  return (
    <section id="comments" className="card scroll-mt-24 p-6">
      <h2 className="mb-4 text-lg font-bold">Comments ({comments.length})</h2>
      {p.me ? (
        p.notice ? (
          <p className="mb-4 rounded-lg border border-amber-300/40 bg-amber-300/5 p-3 text-sm text-amber-200">{p.notice}</p>
        ) : (
          <form className="mb-6 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await post(text, null)) setText(""); }}>
            <textarea className="input" rows={3} placeholder="Say something nice, ask a question, report a bug…" value={text}
              onChange={(e) => setText(e.target.value)} maxLength={4000} />
            <button className="btn-primary" disabled={busy || !text.trim()}>{busy ? "Posting…" : "Comment"}</button>
          </form>
        )
      ) : (
        <p className="mb-4 text-sm text-muted"><Link href={p.loginHref} className="text-brand underline">Sign in</Link> to comment.</p>
      )}
      {error && <p className="mb-3 text-sm text-red-300">{error}</p>}
      <div className="space-y-5">
        {top.map((c) => one(c))}
        {top.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
      </div>
    </section>
  );
}

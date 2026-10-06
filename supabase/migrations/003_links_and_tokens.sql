-- Jace Store: custom download links + API tokens for the CLI.
-- Run once in Supabase SQL Editor (after 002_hub.sql). Safe to re-run.

-- 1. Files can be external links instead of uploads.
--    Hashes/size are filled in when the server can fetch the link (required for
--    Minecraft content so launchers can verify the download).
alter table public.files alter column storage_path drop not null;
alter table public.files alter column sha1 drop not null;
alter table public.files alter column sha512 drop not null;
alter table public.files alter column size drop not null;
alter table public.files add column if not exists is_external boolean not null default false;
alter table public.files add column if not exists label text;

-- 2. Personal API tokens (used by the CLI). Only a SHA-256 hash is stored.
create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 1 and 64),
  token_hash text not null unique,
  prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists api_tokens_user_idx on public.api_tokens (user_id);

alter table public.api_tokens enable row level security;
grant select, delete on public.api_tokens to authenticated;

drop policy if exists "tokens owner read" on public.api_tokens;
create policy "tokens owner read" on public.api_tokens for select using (auth.uid() = user_id);
drop policy if exists "tokens owner delete" on public.api_tokens;
create policy "tokens owner delete" on public.api_tokens for delete using (auth.uid() = user_id);
-- Tokens are created server-side (service role) so the plaintext never touches the DB.

-- Make the Data API see the changes right away.
notify pgrst, 'reload schema';

-- Jace Store: comments, likes, collections, and moderation (Jace's auto moderation, Jace bans and
-- mutes carried over, and Jace Store's own bans and mutes).
-- Run once in Supabase SQL Editor (after 010), AFTER the matching website version is deployed.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Moderation state on accounts
--   ban_from / mute_from: 'store' (a Jace Store moderator), 'jace' (carried over from the linked
--   Jace account, lifted when Jace lifts it) or 'automod' (auto-mute after repeated blocked posts).
--   *_until NULL = for good.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists banned_at timestamptz;
alter table public.profiles add column if not exists ban_until timestamptz;
alter table public.profiles add column if not exists ban_reason text;
alter table public.profiles add column if not exists ban_from text;
alter table public.profiles add column if not exists muted_at timestamptz;
alter table public.profiles add column if not exists mute_until timestamptz;
alter table public.profiles add column if not exists mute_reason text;
alter table public.profiles add column if not exists mute_from text;
alter table public.profiles add column if not exists jace_mod_checked_at timestamptz;

-- Posts Jace's auto moderation refused (also counts toward auto-mutes).
create table if not exists public.automod_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  area text not null,
  matched text not null,
  excerpt text,
  created_at timestamptz not null default now()
);
create index if not exists automod_log_user_idx on public.automod_log (user_id, created_at desc);

-- Can this account post right now? (used by storage uploads; the API checks the same)
create or replace function public.account_can_post(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select not ((p.banned_at is not null and (p.ban_until is null or p.ban_until > now()))
             or (p.muted_at is not null and (p.mute_until is null or p.mute_until > now())))
    from public.profiles p where p.id = uid), false);
$$;
grant execute on function public.account_can_post(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Likes
-- ---------------------------------------------------------------------------
alter table public.projects add column if not exists likes integer not null default 0;
create index if not exists projects_likes_idx on public.projects (likes desc);

create table if not exists public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index if not exists likes_project_idx on public.likes (project_id);

create or replace function public.refresh_project_likes()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.project_id, old.project_id);
begin
  update public.projects set likes = (select count(*) from public.likes where project_id = pid) where id = pid;
  return null;
end $$;
drop trigger if exists likes_refresh_project on public.likes;
create trigger likes_refresh_project after insert or delete on public.likes
  for each row execute function public.refresh_project_likes();

-- keep clients from editing the like counter directly (like downloads)
create or replace function public.protect_downloads()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.downloads := old.downloads;
    if to_jsonb(new) ? 'likes' then new.likes := old.likes; end if;
  end if;
  return new;
end $$;

update public.projects p set likes = (select count(*) from public.likes l where l.project_id = p.id);

-- ---------------------------------------------------------------------------
-- Comments (one level of replies)
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists comments_project_idx on public.comments (project_id, created_at);
create index if not exists comments_parent_idx on public.comments (parent_id);

-- Reports can be about a comment too
alter table public.reports add column if not exists comment_id uuid references public.comments (id) on delete cascade;
drop index if exists public.reports_one_open_per_user;
create unique index if not exists reports_one_open_per_user_item
  on public.reports (project_id, coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid), reporter_id)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  description text not null default '' check (length(description) <= 2000),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists collections_owner_idx on public.collections (owner_id, updated_at desc);

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, project_id)
);
create index if not exists collection_items_project_idx on public.collection_items (project_id);

-- ---------------------------------------------------------------------------
-- Access: everything new is readable (private collections only by their owner);
-- every write goes through the website's server, which applies moderation.
-- ---------------------------------------------------------------------------
alter table public.automod_log enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;

grant select on public.likes, public.comments, public.collections, public.collection_items to anon, authenticated;
grant all on public.likes, public.comments, public.collections, public.collection_items, public.automod_log to service_role;

drop policy if exists "likes readable" on public.likes;
create policy "likes readable" on public.likes for select using (true);
drop policy if exists "comments readable" on public.comments;
create policy "comments readable" on public.comments for select using (true);
drop policy if exists "collections readable" on public.collections;
create policy "collections readable" on public.collections for select using (is_public or owner_id = auth.uid());
drop policy if exists "collection items readable" on public.collection_items;
create policy "collection items readable" on public.collection_items for select using (
  exists (select 1 from public.collections c where c.id = collection_id and (c.is_public or c.owner_id = auth.uid())));

-- Projects, versions, files and profiles: no more direct writes from browsers (the server writes
-- them, checking bans, mutes and Jace's auto moderation first).
revoke insert, update, delete on public.projects, public.versions, public.files from anon, authenticated;
revoke update on public.profiles from anon, authenticated;

-- Banned or muted accounts can't upload files either
drop policy if exists "users upload to own folder" on storage.objects;
create policy "users upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id in ('project-files','icons')
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.account_can_post(auth.uid()));

notify pgrst, 'reload schema';

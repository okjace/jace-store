-- Jace Store schema. Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (username ~ '^[a-zA-Z0-9_-]{3,32}$'),
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'user_name',
             new.raw_user_meta_data ->> 'username',
             split_part(new.email, '@', 1),
             'user'),
    '[^a-zA-Z0-9_-]', '', 'g'));
  if length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 28);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  insert into public.profiles (id, username, display_name, avatar_url)
  values (new.id, candidate,
          coalesce(new.raw_user_meta_data ->> 'full_name', candidate),
          new.raw_user_meta_data ->> 'avatar_url');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Projects (a mod, resource pack, shader, app, ...)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in
    ('mod','resourcepack','shader','datapack','modpack','plugin','world','app')),
  title text not null check (length(title) between 2 and 80),
  summary text not null check (length(summary) between 3 and 256),
  description text not null default '',
  categories text[] not null default '{}',
  loaders text[] not null default '{}',        -- maintained from versions
  game_versions text[] not null default '{}',  -- maintained from versions
  icon_url text,
  source_url text,
  issues_url text,
  license text,
  downloads bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_type_idx on public.projects (type);
create index if not exists projects_downloads_idx on public.projects (downloads desc);
create index if not exists projects_updated_idx on public.projects (updated_at desc);
create index if not exists projects_loaders_idx on public.projects using gin (loaders);
create index if not exists projects_versions_idx on public.projects using gin (game_versions);
create index if not exists projects_categories_idx on public.projects using gin (categories);

-- ---------------------------------------------------------------------------
-- Versions (a release of a project) and their files
-- ---------------------------------------------------------------------------
create table if not exists public.versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  version_number text not null check (length(version_number) between 1 and 64),
  name text not null,
  changelog text not null default '',
  release_channel text not null default 'release'
    check (release_channel in ('release','beta','alpha')),
  loaders text[] not null default '{}',
  game_versions text[] not null default '{}',
  downloads bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);
create index if not exists versions_project_idx on public.versions (project_id, created_at desc);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.versions (id) on delete cascade,
  filename text not null,
  storage_path text not null unique,
  url text not null,
  size bigint not null,
  sha1 text not null,
  sha512 text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists files_version_idx on public.files (version_id);
create index if not exists files_sha1_idx on public.files (sha1);
create index if not exists files_sha512_idx on public.files (sha512);

-- Keep project.loaders / game_versions / updated_at in sync with its versions.
create or replace function public.refresh_project_meta()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.project_id, old.project_id);
begin
  update public.projects p set
    loaders = coalesce((select array_agg(distinct l order by l)
                        from public.versions v, unnest(v.loaders) l
                        where v.project_id = pid), '{}'),
    game_versions = coalesce((select array_agg(distinct g order by g)
                              from public.versions v, unnest(v.game_versions) g
                              where v.project_id = pid), '{}'),
    updated_at = now()
  where p.id = pid;
  return null;
end $$;

drop trigger if exists versions_refresh_project on public.versions;
create trigger versions_refresh_project
  after insert or update or delete on public.versions
  for each row execute function public.refresh_project_meta();

-- Download counter callable by anyone (anon included) without granting UPDATE.
create or replace function public.increment_downloads(file_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare vid uuid; pid uuid;
begin
  select f.version_id, v.project_id into vid, pid
  from public.files f join public.versions v on v.id = f.version_id
  where f.id = file_id;
  if vid is null then return; end if;
  update public.versions set downloads = downloads + 1 where id = vid;
  update public.projects set downloads = downloads + 1 where id = pid;
end $$;
grant execute on function public.increment_downloads(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.versions enable row level security;
alter table public.files    enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "projects readable" on public.projects;
create policy "projects readable" on public.projects for select using (true);
drop policy if exists "projects owner insert" on public.projects;
create policy "projects owner insert" on public.projects for insert
  with check (auth.uid() = owner_id);
drop policy if exists "projects owner update" on public.projects;
create policy "projects owner update" on public.projects for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "projects owner delete" on public.projects;
create policy "projects owner delete" on public.projects for delete
  using (auth.uid() = owner_id);

drop policy if exists "versions readable" on public.versions;
create policy "versions readable" on public.versions for select using (true);
drop policy if exists "versions owner write" on public.versions;
create policy "versions owner write" on public.versions for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

drop policy if exists "files readable" on public.files;
create policy "files readable" on public.files for select using (true);
drop policy if exists "files owner write" on public.files;
create policy "files owner write" on public.files for all
  using (exists (select 1 from public.versions v join public.projects p on p.id = v.project_id
                 where v.id = version_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.versions v join public.projects p on p.id = v.project_id
                      where v.id = version_id and p.owner_id = auth.uid()));

-- Stop clients from editing download counters directly. increment_downloads()
-- runs as the function owner, so it is not affected.
create or replace function public.protect_downloads()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.downloads := old.downloads;
  end if;
  return new;
end $$;

drop trigger if exists projects_protect_downloads on public.projects;
create trigger projects_protect_downloads before update on public.projects
  for each row execute function public.protect_downloads();
drop trigger if exists versions_protect_downloads on public.versions;
create trigger versions_protect_downloads before update on public.versions
  for each row execute function public.protect_downloads();

-- ---------------------------------------------------------------------------
-- Storage buckets. Files are uploaded straight from the browser to Supabase
-- (bypassing Vercel's request-size limit). Paths start with the uploader's id.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', true, 524288000)   -- 500 MB
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('icons', 'icons', true, 2097152,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set public = true;

drop policy if exists "public read store buckets" on storage.objects;
create policy "public read store buckets" on storage.objects for select
  using (bucket_id in ('project-files','icons'));

drop policy if exists "users upload to own folder" on storage.objects;
create policy "users upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id in ('project-files','icons')
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users manage own objects" on storage.objects;
create policy "users manage own objects" on storage.objects for update to authenticated
  using (bucket_id in ('project-files','icons') and owner_id = auth.uid()::text);

drop policy if exists "users delete own objects" on storage.objects;
create policy "users delete own objects" on storage.objects for delete to authenticated
  using (bucket_id in ('project-files','icons') and owner_id = auth.uid()::text);

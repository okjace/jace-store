-- Jace Store: reporting projects + a moderator queue.
-- Run once in Supabase SQL Editor (after 006). Safe to re-run.

-- Moderators. Not writable from the website: add people here with SQL only.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('malware','stolen','inappropriate','spam','broken','other')),
  details text not null default '' check (length(details) <= 2000),
  status text not null default 'open' check (status in ('open','dismissed','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
-- One open report per person per project.
create unique index if not exists reports_one_open_per_user
  on public.reports (project_id, reporter_id) where status = 'open';

-- Everything goes through the server (service role), which checks who's asking.
alter table public.admins enable row level security;
alter table public.reports enable row level security;
grant all on public.admins, public.reports to service_role;

-- Make the site owner a moderator. Add more with:
--   insert into public.admins (user_id) select id from public.profiles where username = 'someone';
insert into public.admins (user_id)
select id from public.profiles where username = 'jace-deb'
on conflict do nothing;

notify pgrst, 'reload schema';

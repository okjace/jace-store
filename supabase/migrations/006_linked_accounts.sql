-- Jace Store: link a Jace account to any store account (so one person can sign
-- in with email, GitHub and/or Jace).
-- Run once in Supabase SQL Editor (after 005). Safe to re-run.

create table if not exists public.jace_links (
  jace_id text primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  jace_username text,
  created_at timestamptz not null default now()
);

alter table public.jace_links enable row level security;
grant select, delete on public.jace_links to authenticated;
grant all on public.jace_links to service_role;

drop policy if exists "jace links owner read" on public.jace_links;
create policy "jace links owner read" on public.jace_links for select using (auth.uid() = user_id);
drop policy if exists "jace links owner delete" on public.jace_links;
create policy "jace links owner delete" on public.jace_links for delete using (auth.uid() = user_id);

-- Accounts created by "Sign in with Jace" before this migration.
insert into public.jace_links (jace_id, user_id, jace_username)
select u.raw_user_meta_data ->> 'jace_id', u.id, u.raw_user_meta_data ->> 'username'
from auth.users u
where u.raw_user_meta_data ->> 'provider' = 'jace'
  and u.raw_user_meta_data ->> 'jace_id' is not null
on conflict do nothing;

notify pgrst, 'reload schema';

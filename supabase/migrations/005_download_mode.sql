-- Jace Store: choose what the Download button does.
--   latest  -> newest version (default)
--   primary -> the version in primary_version_id
--   all     -> opens a list of every version
-- Run once in Supabase SQL Editor (after 004). Safe to re-run.

alter table public.projects add column if not exists download_mode text not null default 'latest';
alter table public.projects drop constraint if exists projects_download_mode_check;
alter table public.projects add constraint projects_download_mode_check
  check (download_mode in ('latest', 'primary', 'all'));
alter table public.projects add column if not exists primary_version_id uuid
  references public.versions (id) on delete set null;

notify pgrst, 'reload schema';

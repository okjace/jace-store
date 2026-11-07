-- Jace Store: project files on Cloudflare R2 (until Jace Store's R2 files reach R2_LIMIT_GB, 4.5 GB
-- by default), then Supabase Storage as before. Run once in Supabase SQL Editor (after 011). Safe to re-run.

-- Where each uploaded file lives ('supabase' = the project-files bucket, 'r2' = Cloudflare R2).
alter table public.files add column if not exists storage text not null default 'supabase';
alter table public.files drop constraint if exists files_storage_check;
alter table public.files add constraint files_storage_check check (storage in ('supabase', 'r2'));

-- How many bytes of Jace Store's files are on each service (Jace Store's own files only; other
-- apps sharing the Cloudflare account, like Jace Social, aren't counted).
create table if not exists public.storage_usage (
  provider text primary key,
  bytes bigint not null default 0
);
insert into public.storage_usage (provider, bytes) values ('r2', 0) on conflict do nothing;

-- Count a new file in only if it still fits under the cap (atomic: two uploads at once can't
-- both squeeze past it). Returns false when it doesn't fit.
create or replace function public.storage_reserve(p text, n bigint, cap bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.storage_usage set bytes = bytes + n where provider = p and bytes + n <= cap;
  return found;
end $$;

-- A deleted file gives its space back.
create or replace function public.storage_release(p text, n bigint)
returns void language sql security definer set search_path = public as $$
  update public.storage_usage set bytes = greatest(0, bytes - n) where provider = p;
$$;

alter table public.storage_usage enable row level security;
grant all on public.storage_usage to service_role;
revoke all on function public.storage_reserve(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.storage_release(text, bigint) from public, anon, authenticated;
grant execute on function public.storage_reserve(text, bigint, bigint) to service_role;
grant execute on function public.storage_release(text, bigint) to service_role;

notify pgrst, 'reload schema';

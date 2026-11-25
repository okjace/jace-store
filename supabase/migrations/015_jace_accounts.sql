-- Jace Store: every Jace account that signed in on a device (the account switcher). Server only.
-- device_hash = sha256 of the device's secret cookie; token_enc = that account's Jace token,
-- encrypted with a key made from the device secret and the server's secret (so this table alone
-- can't be used). Run once in Supabase SQL Editor (after 014). Safe to re-run.
create table if not exists public.jace_device_accounts (
  device_hash text not null,
  jace_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text,
  display_name text,
  picture text,
  token_enc text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  primary key (device_hash, jace_id)
);
alter table public.jace_device_accounts enable row level security;
grant all on public.jace_device_accounts to service_role;
notify pgrst, 'reload schema';

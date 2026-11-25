-- Jace Store: paid projects (one-time or subscription) with Stripe, paid straight to each creator
-- (Stripe Connect), and saved payment methods for buyers. Run once in Supabase SQL Editor (after 013).
-- Safe to re-run.

-- Each account's Stripe links (server only): creators' Stripe account (to get paid) and buyers'
-- Stripe customer (saved payment methods).
create table if not exists public.stripe_links (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  account_id text unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  customer_id text unique,
  updated_at timestamptz not null default now()
);
alter table public.stripe_links enable row level security;
grant all on public.stripe_links to service_role;

-- A project's price (amounts in cents, USD). free = no price.
alter table public.projects add column if not exists price_type text not null default 'free';
alter table public.projects add column if not exists price_cents integer;
alter table public.projects add column if not exists pay_what_you_want boolean not null default false;
alter table public.projects add column if not exists sub_interval text;
do $$ begin
  alter table public.projects add constraint projects_price_type_check check (price_type in ('free', 'one_time', 'subscription'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.projects add constraint projects_sub_interval_check check (sub_interval is null or sub_interval in ('month', 'year'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.projects add constraint projects_price_check check (price_type = 'free' or price_cents >= 100);
exception when duplicate_object then null; end $$;

-- Where a file lives: 'private' = the private paid-files bucket (only buyers get a short-lived link).
alter table public.files drop constraint if exists files_storage_check;
alter table public.files add constraint files_storage_check check (storage in ('supabase', 'r2', 'private'));

-- What people bought.
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('one_time', 'subscription')),
  status text not null,                        -- paid / refunded, or a Stripe subscription status (active, canceled…)
  amount_cents integer not null,
  currency text not null default 'usd',
  sub_interval text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchases_user_idx on public.purchases(user_id);
create index if not exists purchases_project_idx on public.purchases(project_id);

alter table public.purchases enable row level security;
drop policy if exists "purchases: own" on public.purchases;
create policy "purchases: own" on public.purchases for select using (auth.uid() = user_id);
drop policy if exists "purchases: creator" on public.purchases;
create policy "purchases: creator" on public.purchases for select using (
  exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
grant select on public.purchases to authenticated;
grant all on public.purchases to service_role;

-- The private bucket for paid projects' files (no public links; downloads get a short-lived signed link).
insert into storage.buckets (id, name, public) values ('paid-files', 'paid-files', false)
on conflict (id) do update set public = false;

notify pgrst, 'reload schema';

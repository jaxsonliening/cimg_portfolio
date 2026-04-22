-- cimg_portfolio schema
-- Run this in the Supabase SQL editor for a fresh project, or via `supabase db push`.
-- Idempotent: safe to re-run during early development.

-- ---------- extensions ----------
create extension if not exists "pgcrypto";

-- ---------- committees ----------
create table if not exists public.committees (
  id             text primary key,
  name           text not null,
  description    text,
  color          text not null,
  display_order  int  not null default 0
);

-- ---------- positions ----------
create table if not exists public.positions (
  id            uuid primary key default gen_random_uuid(),
  ticker        text not null check (ticker = upper(ticker)),
  name          text not null,
  committee_id  text not null references public.committees(id),
  shares        numeric(18,4) not null check (shares > 0),
  cost_basis    numeric(18,4) not null check (cost_basis >= 0),
  purchased_at  date not null,
  thesis        text,
  closed_at     date,
  close_price   numeric(18,4),
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  check ((closed_at is null) = (close_price is null))
);

create index if not exists positions_ticker_idx on public.positions (ticker);
create index if not exists positions_open_idx   on public.positions (committee_id) where closed_at is null;

-- ---------- price_snapshots ----------
create table if not exists public.price_snapshots (
  ticker            text not null,
  snapshot_date     date not null,
  price             numeric(18,4) not null,
  market_cap        numeric(20,2),
  enterprise_value  numeric(20,2),
  pe_ratio          numeric(12,4),
  eps               numeric(12,4),
  dividend_yield    numeric(8,6),
  sector            text,
  industry          text,
  source            text not null,
  created_at        timestamptz not null default now(),
  primary key (ticker, snapshot_date)
);

create index if not exists price_snapshots_date_idx on public.price_snapshots (snapshot_date);

-- ---------- fund_snapshots ----------
create table if not exists public.fund_snapshots (
  snapshot_date  date primary key,
  total_value    numeric(18,4) not null,
  cash           numeric(18,4) not null default 0,
  created_at     timestamptz not null default now()
);

-- ---------- benchmark_snapshots ----------
create table if not exists public.benchmark_snapshots (
  symbol         text not null,
  snapshot_date  date not null,
  price          numeric(18,4) not null,
  created_at     timestamptz not null default now(),
  primary key (symbol, snapshot_date)
);

-- ---------- profiles ----------
create table if not exists public.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  role          text not null default 'viewer' check (role in ('admin','viewer')),
  display_name  text
);

-- ---------- seed committees ----------
-- Placeholder names/colors. Replace with the real CIMG committee list.
insert into public.committees (id, name, description, color, display_order) values
  ('tech',        'Technology',            null, '#3b82f6', 1),
  ('consumer',    'Consumer',              null, '#f59e0b', 2),
  ('healthcare',  'Healthcare',            null, '#10b981', 3),
  ('financials',  'Financial Services',    null, '#6366f1', 4),
  ('industrials', 'Industrials',           null, '#ef4444', 5),
  ('energy',      'Energy & Utilities',    null, '#14b8a6', 6),
  ('real_estate', 'Real Estate & REITs',   null, '#a855f7', 7)
on conflict (id) do nothing;

-- ---------- RLS ----------
alter table public.committees           enable row level security;
alter table public.positions            enable row level security;
alter table public.price_snapshots      enable row level security;
alter table public.fund_snapshots       enable row level security;
alter table public.benchmark_snapshots  enable row level security;
alter table public.profiles             enable row level security;

-- public read on everything except profiles
drop policy if exists "public read committees"          on public.committees;
drop policy if exists "public read positions"           on public.positions;
drop policy if exists "public read price_snapshots"     on public.price_snapshots;
drop policy if exists "public read fund_snapshots"      on public.fund_snapshots;
drop policy if exists "public read benchmark_snapshots" on public.benchmark_snapshots;

create policy "public read committees"          on public.committees          for select using (true);
create policy "public read positions"           on public.positions           for select using (true);
create policy "public read price_snapshots"     on public.price_snapshots     for select using (true);
create policy "public read fund_snapshots"      on public.fund_snapshots      for select using (true);
create policy "public read benchmark_snapshots" on public.benchmark_snapshots for select using (true);

-- profiles: users can read their own row
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = user_id);

-- admin-only writes on positions
drop policy if exists "admin write positions" on public.positions;
create policy "admin write positions" on public.positions
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

-- Snapshot tables are written only by the service role (which bypasses RLS),
-- so no INSERT/UPDATE policies are granted to regular users.

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
-- One row per buy lot. Lots are immutable — sells go in public.trades and
-- are FIFO-allocated against lots at query time to compute remaining shares
-- and realized P&L.
create table if not exists public.positions (
  id            uuid primary key default gen_random_uuid(),
  ticker        text not null check (ticker = upper(ticker)),
  name          text not null,
  committee_id  text not null references public.committees(id),
  shares        numeric(18,4) not null check (shares > 0),
  cost_basis    numeric(18,4) not null check (cost_basis >= 0),
  purchased_at  date not null,
  thesis        text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

create index if not exists positions_ticker_idx     on public.positions (ticker);
create index if not exists positions_committee_idx  on public.positions (committee_id);
create index if not exists positions_purchased_idx  on public.positions (purchased_at);

-- ---------- trades ----------
-- Sells and trims. Each row consumes shares from the oldest open lot(s) of
-- the same ticker via FIFO at read time. No lot-pointer stored here — the
-- allocation is recomputed on every query.
create table if not exists public.trades (
  id          uuid primary key default gen_random_uuid(),
  ticker      text not null check (ticker = upper(ticker)),
  shares      numeric(18,4) not null check (shares > 0),
  price       numeric(18,4) not null check (price >= 0),
  traded_at   date not null,
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists trades_ticker_idx    on public.trades (ticker);
create index if not exists trades_traded_at_idx on public.trades (traded_at);

-- ---------- cash_transactions ----------
-- Every cash movement — deposits, withdrawals, dividends, trade proceeds,
-- fees, one-off adjustments. Cash balance is always sum(amount).
-- Positive amount = cash in. Negative = cash out.
create table if not exists public.cash_transactions (
  id           uuid primary key default gen_random_uuid(),
  amount       numeric(18,4) not null,
  kind         text not null check (
    kind in ('deposit','withdrawal','dividend','trade_buy','trade_sell','fee','adjustment')
  ),
  ticker       text,
  occurred_at  date not null,
  note         text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create index if not exists cash_transactions_kind_idx      on public.cash_transactions (kind);
create index if not exists cash_transactions_occurred_idx  on public.cash_transactions (occurred_at);
create index if not exists cash_transactions_ticker_idx    on public.cash_transactions (ticker);

-- ---------- price_ticks ----------
-- Intraday quotes, written every 15 min during US market hours.
-- Pruned to last ~30 days by the daily job.
create table if not exists public.price_ticks (
  ticker       text not null,
  observed_at  timestamptz not null,
  price        numeric(18,4) not null,
  source       text not null,
  primary key (ticker, observed_at)
);

create index if not exists price_ticks_observed_at_idx on public.price_ticks (observed_at);

-- ---------- price_snapshots ----------
-- Daily close + fundamentals, written once at 17:00 ET.
create table if not exists public.price_snapshots (
  ticker            text not null,
  snapshot_date     date not null,
  close_price       numeric(18,4) not null,
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
-- Holds both intraday ticks and daily closes for the benchmark (SPY).
-- is_daily_close = true marks the official session close.
create table if not exists public.benchmark_snapshots (
  symbol          text not null,
  observed_at     timestamptz not null,
  price           numeric(18,4) not null,
  is_daily_close  boolean not null default false,
  created_at      timestamptz not null default now(),
  primary key (symbol, observed_at)
);

create unique index if not exists benchmark_snapshots_daily_close_uniq
  on public.benchmark_snapshots (symbol, (observed_at::date))
  where is_daily_close;

create index if not exists benchmark_snapshots_observed_at_idx
  on public.benchmark_snapshots (observed_at);

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
alter table public.trades               enable row level security;
alter table public.cash_transactions    enable row level security;
alter table public.price_ticks          enable row level security;
alter table public.price_snapshots      enable row level security;
alter table public.fund_snapshots       enable row level security;
alter table public.benchmark_snapshots  enable row level security;
alter table public.profiles             enable row level security;

-- public read on everything except profiles
drop policy if exists "public read committees"          on public.committees;
drop policy if exists "public read positions"           on public.positions;
drop policy if exists "public read trades"              on public.trades;
drop policy if exists "public read cash_transactions"   on public.cash_transactions;
drop policy if exists "public read price_ticks"         on public.price_ticks;
drop policy if exists "public read price_snapshots"     on public.price_snapshots;
drop policy if exists "public read fund_snapshots"      on public.fund_snapshots;
drop policy if exists "public read benchmark_snapshots" on public.benchmark_snapshots;

create policy "public read committees"          on public.committees          for select using (true);
create policy "public read positions"           on public.positions           for select using (true);
create policy "public read trades"              on public.trades              for select using (true);
create policy "public read cash_transactions"   on public.cash_transactions   for select using (true);
create policy "public read price_ticks"         on public.price_ticks         for select using (true);
create policy "public read price_snapshots"     on public.price_snapshots     for select using (true);
create policy "public read fund_snapshots"      on public.fund_snapshots      for select using (true);
create policy "public read benchmark_snapshots" on public.benchmark_snapshots for select using (true);

-- profiles: users can read their own row
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = user_id);

-- Helper: is the current request's user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- admin-only writes on positions, trades, and cash_transactions
drop policy if exists "admin write positions"         on public.positions;
drop policy if exists "admin write trades"            on public.trades;
drop policy if exists "admin write cash_transactions" on public.cash_transactions;

create policy "admin write positions"         on public.positions
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admin write trades"            on public.trades
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admin write cash_transactions" on public.cash_transactions
  for all using (public.is_admin()) with check (public.is_admin());

-- Snapshot tables are written only by the service role (which bypasses RLS),
-- so no INSERT/UPDATE policies are granted to regular users.

-- ---------- auto-create profiles row on signup ----------
-- Every new auth.users row gets a matching public.profiles row with
-- role='viewer'. Promote a user to admin by running:
--   update public.profiles set role='admin' where user_id = '<uuid>';
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, role, display_name)
  values (
    new.id,
    'viewer',
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

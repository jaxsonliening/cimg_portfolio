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
  kind         text not null,
  ticker       text,
  occurred_at  date not null,
  note         text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  constraint cash_transactions_kind_valid check (
    kind in (
      'deposit','withdrawal','dividend','trade_buy','trade_sell',
      'fee','adjustment','capital_injection'
    )
  )
);

-- If an earlier revision of this schema created the old unnamed check,
-- drop it and re-add the named one so `capital_injection` is accepted.
alter table public.cash_transactions
  drop constraint if exists cash_transactions_kind_check;
alter table public.cash_transactions
  drop constraint if exists cash_transactions_kind_valid;
alter table public.cash_transactions
  add  constraint cash_transactions_kind_valid check (
    kind in (
      'deposit','withdrawal','dividend','trade_buy','trade_sell',
      'fee','adjustment','capital_injection'
    )
  );

create index if not exists cash_transactions_kind_idx      on public.cash_transactions (kind);
create index if not exists cash_transactions_occurred_idx  on public.cash_transactions (occurred_at);
create index if not exists cash_transactions_ticker_idx    on public.cash_transactions (ticker);

-- ---------- ticker_meta ----------
-- Analyst-maintained, per-ticker metadata. Distinct from positions because
-- target weight and intrinsic value apply to the ticker as a whole and
-- change over time, while position lots are immutable.
--
--   target_weight     — desired portfolio weight, 0..1 (e.g. 0.04 = 4%)
--   intrinsic_value   — per-share intrinsic value estimate (USD)
--   value_updated_at  — when intrinsic_value was last set; drives the
--                       "since last update" column on the dashboard
create table if not exists public.ticker_meta (
  ticker            text primary key check (ticker = upper(ticker)),
  target_weight     numeric(6,4) check (target_weight is null or (target_weight >= 0 and target_weight <= 1)),
  intrinsic_value   numeric(18,4) check (intrinsic_value is null or intrinsic_value >= 0),
  value_updated_at  timestamptz,
  updated_by        uuid references auth.users(id),
  updated_at        timestamptz not null default now()
);

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
  forward_pe        numeric(12,4),
  eps               numeric(12,4),
  dividend_yield    numeric(8,6),
  price_to_book     numeric(12,4),
  ev_to_ebitda      numeric(12,4),
  roe               numeric(10,6),
  beta              numeric(8,4),
  sector            text,
  industry          text,
  source            text not null,
  created_at        timestamptz not null default now(),
  primary key (ticker, snapshot_date)
);

-- Backfill for re-runs against an older schema that lacked the extended
-- fundamentals columns. Adding them as nullable is a metadata-only op.
alter table public.price_snapshots add column if not exists forward_pe    numeric(12,4);
alter table public.price_snapshots add column if not exists price_to_book numeric(12,4);
alter table public.price_snapshots add column if not exists ev_to_ebitda  numeric(12,4);
alter table public.price_snapshots add column if not exists roe           numeric(10,6);
alter table public.price_snapshots add column if not exists beta          numeric(8,4);

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
-- is_daily_close = true marks the official session close; close_date carries
-- the session's trading date so we can uniquely index one close per day
-- without relying on a non-immutable timestamptz → date cast.
create table if not exists public.benchmark_snapshots (
  symbol          text not null,
  observed_at     timestamptz not null,
  price           numeric(18,4) not null,
  is_daily_close  boolean not null default false,
  close_date      date,
  created_at      timestamptz not null default now(),
  primary key (symbol, observed_at),
  constraint benchmark_close_date_matches_flag check (
    (is_daily_close and close_date is not null)
    or (not is_daily_close and close_date is null)
  )
);

-- Backfill for re-runs against an older schema that lacked close_date.
alter table public.benchmark_snapshots
  add column if not exists close_date date;

create unique index if not exists benchmark_snapshots_daily_close_uniq
  on public.benchmark_snapshots (symbol, close_date)
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
-- The canonical 8 CIMG committees. Upsert so re-running the schema
-- brings the rows in line with the list below.
insert into public.committees (id, name, description, color, display_order) values
  ('tech',          'Technology',                                         null, '#3b82f6', 1),
  ('financials',    'Financials',                                         null, '#6366f1', 2),
  ('discretionary', 'Consumer Discretionary',                             null, '#f59e0b', 3),
  ('staples',       'Consumer Staples',                                   null, '#84cc16', 4),
  ('adt',           'Aerospace, Defense & Transportation',                null, '#ef4444', 5),
  ('tme',           'Telecom, Media & Entertainment',                     null, '#a855f7', 6),
  ('ine',           'Industrials & Energy',                               null, '#14b8a6', 7),
  ('healthcare',    'Healthcare',                                         null, '#10b981', 8)
on conflict (id) do update set
  name          = excluded.name,
  description   = excluded.description,
  color         = excluded.color,
  display_order = excluded.display_order;

-- Remove committees that predate the canonical list, but only if nothing
-- references them. If a position still points at an old committee, the
-- delete is a no-op and the owner is expected to reassign it first.
delete from public.committees c
 where c.id not in ('tech','financials','discretionary','staples','adt','tme','ine','healthcare')
   and not exists (select 1 from public.positions p where p.committee_id = c.id);

-- ---------- RLS ----------
alter table public.committees           enable row level security;
alter table public.positions            enable row level security;
alter table public.trades               enable row level security;
alter table public.cash_transactions    enable row level security;
alter table public.ticker_meta          enable row level security;
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
drop policy if exists "public read ticker_meta"         on public.ticker_meta;
drop policy if exists "public read price_ticks"         on public.price_ticks;
drop policy if exists "public read price_snapshots"     on public.price_snapshots;
drop policy if exists "public read fund_snapshots"      on public.fund_snapshots;
drop policy if exists "public read benchmark_snapshots" on public.benchmark_snapshots;

create policy "public read committees"          on public.committees          for select using (true);
create policy "public read positions"           on public.positions           for select using (true);
create policy "public read trades"              on public.trades              for select using (true);
create policy "public read cash_transactions"   on public.cash_transactions   for select using (true);
create policy "public read ticker_meta"         on public.ticker_meta         for select using (true);
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

-- admin-only writes on positions, trades, cash_transactions, ticker_meta
drop policy if exists "admin write positions"         on public.positions;
drop policy if exists "admin write trades"            on public.trades;
drop policy if exists "admin write cash_transactions" on public.cash_transactions;
drop policy if exists "admin write ticker_meta"       on public.ticker_meta;

create policy "admin write positions"         on public.positions
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admin write trades"            on public.trades
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admin write cash_transactions" on public.cash_transactions
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admin write ticker_meta"       on public.ticker_meta
  for all using (public.is_admin()) with check (public.is_admin());

-- Snapshot tables are written only by the service role (which bypasses RLS),
-- so no INSERT/UPDATE policies are granted to regular users.

-- ---------- audit_log ----------
-- Append-only record of every admin action. Admin routes insert a row
-- per successful mutation with the actor, a dotted action (e.g.
-- "cash.delete", "users.promote"), the resource being modified, and
-- a JSONB diff. Actor email is snapshotted at write time so removing
-- a user doesn't strand their prior actions as "unknown".
create table if not exists public.audit_log (
  id               uuid primary key default gen_random_uuid(),
  actor_user_id    uuid references auth.users(id) on delete set null,
  actor_email      text,
  action           text not null,
  resource_type    text,
  resource_id      text,
  changes          jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx      on public.audit_log (actor_user_id);
create index if not exists audit_log_action_idx     on public.audit_log (action);

alter table public.audit_log enable row level security;

-- Admins can read the log. Writes happen through the service role
-- key from within admin API route handlers, so no INSERT policy
-- for user sessions.
drop policy if exists "admin read audit_log" on public.audit_log;
create policy "admin read audit_log" on public.audit_log
  for select using (public.is_admin());

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

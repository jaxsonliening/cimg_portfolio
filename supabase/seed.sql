-- CIMG portfolio seed from the owner's 3/31/2026 Excel snapshot.
-- 27 open positions, per-ticker target weight + intrinsic value,
-- opening cash balance, closing prices, and the SPY benchmark close.
--
-- Idempotent — re-running after ingesting live prices will NOT wipe
-- newer data because it ON CONFLICT DO NOTHING's the snapshot rows
-- and skips cash_transactions inserts when any already exist.
--
-- Run after supabase/schema.sql. From Supabase SQL Editor or CLI:
--   psql "$SUPABASE_DB_URL" -f supabase/seed.sql

-- ---------- positions (one row per ticker; lots immutable) ----------
insert into public.positions
  (ticker, name, committee_id, shares, cost_basis, purchased_at)
values
  ('MO',    'Altria Group',            'staples',       2941,  43.25, '2024-04-29'),
  ('AMZN',  'Amazon.com',              'tech',           600, 138.18, '2025-08-13'),
  ('BN',    'Brookfield Corporation',  'financials',    3798,  26.91, '2024-04-02'),
  ('CELH',  'Celsius Holdings',        'discretionary', 1744,  31.35, '2024-10-24'),
  ('STZ',   'Constellation Brands',    'discretionary',  814, 140.22, '2025-10-13'),
  ('CROX',  'Crocs',                   'discretionary',  311,  88.45, '2025-02-12'),
  ('DEO',   'Diageo',                  'staples',        345, 144.21, '2024-02-14'),
  ('DG',    'Dollar General',          'staples',       1153, 103.07, '2023-10-09'),
  ('FISV',  'Fiserv',                  'tech',          1792,  66.16, '2025-12-08'),
  ('FLYW',  'Flywire',                 'financials',    8495,  13.57, '2025-12-08'),
  ('IMCDY', 'IMCD',                    'ine',           2046,  55.82, '2026-04-20'),
  ('JBI',   'Janus International Group','ine',          7349,  10.44, '2022-09-13'),
  ('MGNI',  'Magnite',                 'tme',           4629,  13.45, '2026-03-02'),
  ('MH',    'McGraw Hill',             'tme',           9550,  12.21, '2025-10-13'),
  ('META',  'Meta Platforms',          'tme',             96, 209.13, '2023-04-03'),
  ('MNRO',  'Monro',                   'adt',           3572,  16.66, '2025-10-13'),
  ('OC',    'Owens Corning',           'ine',            571, 190.73, '2024-12-17'),
  ('PM',    'Philip Morris International','discretionary',534,  96.94, '2024-05-01'),
  ('SIRI',  'SiriusXM',                'tech',          4390,  25.00, '2025-02-21'),
  ('SNAP',  'Snap',                    'tme',           6168,   7.69, '2025-04-30'),
  ('BCO',   'The Brink''s Company',    'financials',    1178,  89.01, '2025-04-30'),
  ('TDW',   'Tidewater',               'ine',            759,  35.57, '2025-04-30'),
  ('UNH',   'UnitedHealth Group',      'healthcare',     125, 364.80, '2021-03-22'),
  ('VAL',   'Valaris',                 'ine',            659,  38.97, '2025-02-26'),
  ('VRSN',  'Verisign',                'tech',           221, 263.40, '2026-04-13'),
  ('HCC',   'Warrior Met Coal',        'ine',           1523,  58.15, '2024-05-01')
on conflict do nothing;

-- ---------- ticker_meta (target weight + intrinsic value) ----------
-- value_updated_at is the "last update trading day" the PM cares about,
-- which the dashboard uses for the "Since Last Update" column.
insert into public.ticker_meta
  (ticker, target_weight, intrinsic_value, value_updated_at)
values
  ('MO',    0.075,  78.92, '2026-03-31 16:00:00-04'),
  ('AMZN',  0.050, 288.80, '2026-03-31 16:00:00-04'),
  ('BN',    0.050,  67.46, '2026-03-31 16:00:00-04'),
  ('CELH',  0.025,  68.70, '2026-03-31 16:00:00-04'),
  ('STZ',   0.025, 186.57, '2026-03-31 16:00:00-04'),
  ('CROX',  0.025, 156.40, '2026-03-31 16:00:00-04'),
  ('DEO',   0.025, 147.41, '2026-03-31 16:00:00-04'),
  ('DG',    0.075, 188.00, '2026-03-31 16:00:00-04'),
  ('FISV',  0.050, 100.43, '2026-03-31 16:00:00-04'),
  ('FLYW',  0.050,  19.37, '2026-03-31 16:00:00-04'),
  ('IMCDY', 0.050,  76.75, '2026-03-31 16:00:00-04'),
  ('JBI',   0.025,   9.28, '2026-03-31 16:00:00-04'),
  ('MGNI',  0.025,  20.12, '2026-03-31 16:00:00-04'),
  ('MH',    0.050,  24.02, '2026-03-31 16:00:00-04'),
  ('META',  0.025, 781.46, '2026-03-31 16:00:00-04'),
  ('MNRO',  0.050,  24.05, '2026-03-31 16:00:00-04'),
  ('OC',    0.050, 197.03, '2026-03-31 16:00:00-04'),
  ('PM',    0.025, 182.67, '2026-03-31 16:00:00-04'),
  ('SIRI',  0.025,  27.49, '2026-03-31 16:00:00-04'),
  ('SNAP',  0.025,  13.90, '2026-03-31 16:00:00-04'),
  ('BCO',   0.050, 152.40, '2026-03-31 16:00:00-04'),
  ('TDW',   0.025,  69.84, '2026-03-31 16:00:00-04'),
  ('UNH',   0.025, 431.12, '2026-03-31 16:00:00-04'),
  ('VAL',   0.025,  85.00, '2026-03-31 16:00:00-04'),
  ('VRSN',  0.025, 353.70, '2026-03-31 16:00:00-04'),
  ('HCC',   0.050, 103.11, '2026-03-31 16:00:00-04')
on conflict (ticker) do update set
  target_weight    = excluded.target_weight,
  intrinsic_value  = excluded.intrinsic_value,
  value_updated_at = excluded.value_updated_at;

-- ---------- price_snapshots (3/31/2026 closes) ----------
-- Drives current price + market value + weight on the dashboard until
-- the cron job writes fresher data.
insert into public.price_snapshots
  (ticker, snapshot_date, close_price, source)
values
  ('MO',    '2026-03-31',  65.17, 'excel_seed'),
  ('AMZN',  '2026-03-31', 255.36, 'excel_seed'),
  ('BN',    '2026-03-31',  46.20, 'excel_seed'),
  ('CELH',  '2026-03-31',  33.26, 'excel_seed'),
  ('STZ',   '2026-03-31', 156.88, 'excel_seed'),
  ('CROX',  '2026-03-31', 105.29, 'excel_seed'),
  ('DEO',   '2026-03-31',  79.95, 'excel_seed'),
  ('DG',    '2026-03-31', 123.15, 'excel_seed'),
  ('FISV',  '2026-03-31',  63.26, 'excel_seed'),
  ('FLYW',  '2026-03-31',  14.00, 'excel_seed'),
  ('IMCDY', '2026-03-31',  56.66, 'excel_seed'),
  ('JBI',   '2026-03-31',   5.48, 'excel_seed'),
  ('MGNI',  '2026-03-31',  13.39, 'excel_seed'),
  ('MH',    '2026-03-31',  14.33, 'excel_seed'),
  ('META',  '2026-03-31', 674.72, 'excel_seed'),
  ('MNRO',  '2026-03-31',  17.57, 'excel_seed'),
  ('OC',    '2026-03-31', 122.88, 'excel_seed'),
  ('PM',    '2026-03-31', 164.01, 'excel_seed'),
  ('SIRI',  '2026-03-31',  28.06, 'excel_seed'),
  ('SNAP',  '2026-03-31',   5.85, 'excel_seed'),
  ('BCO',   '2026-03-31', 111.23, 'excel_seed'),
  ('TDW',   '2026-03-31',  85.64, 'excel_seed'),
  ('UNH',   '2026-03-31', 353.42, 'excel_seed'),
  ('VAL',   '2026-03-31',  90.46, 'excel_seed'),
  ('VRSN',  '2026-03-31', 269.83, 'excel_seed'),
  ('HCC',   '2026-03-31',  88.76, 'excel_seed')
on conflict (ticker, snapshot_date) do nothing;

-- ---------- benchmark_snapshot (SPY 3/31/2026 close) ----------
insert into public.benchmark_snapshots
  (symbol, observed_at, price, is_daily_close, close_date)
values
  ('SPY', '2026-03-31 16:00:00-04', 711.18, true, '2026-03-31')
on conflict (symbol, observed_at) do nothing;

-- ---------- opening cash balance ----------
-- Single deposit sized so the dashboard's cash balance matches the
-- $82,310.59 figure from the Excel snapshot. Safe to delete and
-- replace with the real deposit/injection history once the PM has it.
insert into public.cash_transactions
  (amount, kind, occurred_at, note)
select 82310.59, 'deposit', '2026-03-31', 'Opening balance seeded from 3/31/2026 Excel snapshot'
where not exists (select 1 from public.cash_transactions);

-- ---------- capital_injection placeholder ----------
-- The Excel "Pre / Post Capital Injection" rows split performance
-- around a specific injection event. 2020-02-01 is the date the
-- owner identified as the canonical injection; amount is 0 as a
-- placeholder so the PM can edit it in /admin/cash when the real
-- figure is known.
insert into public.cash_transactions
  (amount, kind, occurred_at, note)
select 0, 'capital_injection', '2020-02-01',
       'Capital injection anchor date; edit amount in /admin/cash when known'
where not exists (
  select 1 from public.cash_transactions where kind = 'capital_injection'
);

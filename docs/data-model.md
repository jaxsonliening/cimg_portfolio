# Data model

All tables live in the `public` schema of the Supabase Postgres instance. Row-level security is on for every table; see `supabase/schema.sql` for the policies.

## Tables

### `committees`

Seed data. Seven rows, fixed.

| column | type | notes |
| --- | --- | --- |
| `id` | `text` PK | short slug, e.g. `'tech'`, `'consumer'` |
| `name` | `text` | display name |
| `description` | `text` | optional blurb |
| `color` | `text` | hex string for the pie chart |
| `display_order` | `int` | stable chart ordering |

### `positions`

One row per **buy lot**. Rows are fully immutable — no updates, no deletes. A partial sell (trim) or full sell becomes a row in `trades`, which is FIFO-allocated against lots at read time to compute what's left.

| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | `gen_random_uuid()` |
| `ticker` | `text` | upper-cased, no exchange prefix |
| `name` | `text` | company name at purchase time (snapshot) |
| `committee_id` | `text` FK → `committees.id` | which committee owns this lot |
| `shares` | `numeric(18,4)` | original lot size |
| `cost_basis` | `numeric(18,4)` | per-share cost |
| `purchased_at` | `date` | trade date |
| `thesis` | `text` | why we bought |
| `created_by` | `uuid` FK → `auth.users.id` | the admin who logged it |
| `created_at` | `timestamptz` | `now()` |

Derived (per lot, computed via FIFO): `remaining_shares`, `realized_pnl`. See `lib/calc/lots.ts`.
Derived (per ticker, aggregated): `shares_remaining = sum(remaining_shares)`, `avg_cost_basis = sum(cost_basis × remaining_shares) / shares_remaining`.

### `trades`

One row per sell (trim or full close-out). Allocated against open lots of the same ticker FIFO (oldest lot first).

| column | type |
| --- | --- |
| `id` | `uuid` PK |
| `ticker` | `text` |
| `shares` | `numeric(18,4)` shares sold |
| `price` | `numeric(18,4)` per-share exit price |
| `traded_at` | `date` |
| `note` | `text` |
| `created_by` | `uuid` FK → `auth.users.id` |
| `created_at` | `timestamptz` |

Invariant: `sum(trades.shares for ticker) ≤ sum(positions.shares for ticker)`. Enforced at the API boundary, not the DB (would require a trigger with aggregate checks).

### `cash_transactions`

Every cash movement. Cash balance at any point = `sum(amount where occurred_at ≤ point)`.

| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `amount` | `numeric(18,4)` | positive = cash in, negative = cash out |
| `kind` | `text` enum | `deposit \| withdrawal \| dividend \| trade_buy \| trade_sell \| fee \| adjustment` |
| `ticker` | `text` nullable | required for `dividend` and `trade_*` |
| `occurred_at` | `date` | |
| `note` | `text` | |
| `created_by` | `uuid` FK → `auth.users.id` | |
| `created_at` | `timestamptz` | |

Sidecars: buying a lot inserts `kind='trade_buy'` with `amount = -(shares × cost_basis)`. Selling inserts `kind='trade_sell'` with `amount = shares × price`. Dividends, deposits, withdrawals, fees are logged directly via the admin UI.

Derived: `dividend_income_total = sum(amount where kind='dividend')`, optionally filtered by year or ticker.

### `price_ticks`

Intraday vendor quote per ticker. Written every 15 min during US market hours by the `snapshot-ticks` job. Retained ~30 days, then pruned by the daily job.

| column | type |
| --- | --- |
| `ticker` | `text` |
| `observed_at` | `timestamptz` |
| `price` | `numeric(18,4)` |
| `source` | `text` — `'fmp'` or `'alpha_vantage'` |

Primary key: `(ticker, observed_at)`. Index on `observed_at` for range queries.

Used by:
- `/api/portfolio/summary` — latest tick for "current price" and daily P&L calc
- `/api/portfolio/performance?range=1D` — today's intraday series
- Positions table — `current_price`, `market_value`, `unrealized_pnl`

### `price_snapshots`

Daily vendor snapshot per ticker — the official daily close plus fundamentals. Written once after market close (17:00 ET) by the `snapshot-daily` job.

| column | type |
| --- | --- |
| `ticker` | `text` |
| `snapshot_date` | `date` |
| `close_price` | `numeric(18,4)` — day's close (copied from the last `price_ticks` row) |
| `market_cap` | `numeric(20,2)` |
| `enterprise_value` | `numeric(20,2)` |
| `pe_ratio` | `numeric(12,4)` |
| `eps` | `numeric(12,4)` |
| `dividend_yield` | `numeric(8,6)` |
| `sector` | `text` |
| `industry` | `text` |
| `source` | `text` — `'fmp'` or `'alpha_vantage'` |
| `created_at` | `timestamptz` |

Primary key: `(ticker, snapshot_date)`. This is the source of truth for historical ticker prices and the fundamentals view.

### `fund_snapshots`

Daily aggregate for the whole fund. Written by the cron after `price_snapshots`.

| column | type |
| --- | --- |
| `snapshot_date` | `date` PK |
| `total_value` | `numeric(18,4)` — sum of open positions at close |
| `cash` | `numeric(18,4)` — cash balance (PM can update manually) |
| `created_at` | `timestamptz` |

### `benchmark_snapshots`

S&P 500 (`SPY`) prices. Written by both cron jobs — intraday ticks and a daily close row per session. `is_daily_close` flags the official daily row so historical joins skip intraday duplicates.

| column | type |
| --- | --- |
| `symbol` | `text` |
| `observed_at` | `timestamptz` |
| `price` | `numeric(18,4)` |
| `is_daily_close` | `boolean` default `false` |
| `created_at` | `timestamptz` |

Primary key: `(symbol, observed_at)`. Partial unique index on `(symbol, date(observed_at))` where `is_daily_close = true` so there's exactly one close per session.

### `profiles`

Extends `auth.users` with a role.

| column | type |
| --- | --- |
| `user_id` | `uuid` PK FK → `auth.users.id` |
| `role` | `text` — `'admin'` or `'viewer'`, default `'viewer'` |
| `display_name` | `text` |

## Invariants

- **No floats for money.** `numeric` throughout.
- **No stored percentages.** Compute `pct = (value - cost) / cost` at read time.
- **`positions` and `trades` are append-only.** The admin UI has no edit or delete paths for either. Corrections are `kind='adjustment'` cash rows plus, if share counts changed, a new lot or offsetting trade.
- **Cash is derived**, never stored as a live mutable value. `fund_snapshots.cash` is historical, written by the daily cron from `sum(cash_transactions.amount where occurred_at ≤ snapshot_date)`.
- **`price_snapshots` uses `date` (one row per ticker per session); `price_ticks` uses `timestamptz`.**
- **Hard delete only `profiles` rows and expired `price_ticks`.**
- **`ticker` is upper-cased at write time** so joins with snapshots are case-safe.

## Seed data

`supabase/schema.sql` inserts placeholder rows for the seven committees. Edit the names/colors once the real committee list is confirmed.

## Historical import

The owner will supply an inception-to-date CSV. Expected columns:

```
ticker, name, committee, shares, cost_basis, purchased_at, closed_at, close_price, thesis
```

Import path: a one-off script under `scripts/import-history.ts` that reads the CSV, normalizes tickers, and inserts via the service role.

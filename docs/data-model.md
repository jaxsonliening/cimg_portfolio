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

One row per lot. **Shares and cost basis are immutable** — a correction is a new row, a sale is a `closed_at` + `close_price` update.

| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` PK | `gen_random_uuid()` |
| `ticker` | `text` | upper-cased, no exchange prefix |
| `name` | `text` | company name at purchase time (snapshot) |
| `committee_id` | `text` FK → `committees.id` | which committee owns this |
| `shares` | `numeric(18,4)` | |
| `cost_basis` | `numeric(18,4)` | per-share cost |
| `purchased_at` | `date` | trade date |
| `thesis` | `text` | why we bought |
| `closed_at` | `date` nullable | set when sold |
| `close_price` | `numeric(18,4)` nullable | per-share exit price |
| `created_by` | `uuid` FK → `auth.users.id` | the admin who logged it |
| `created_at` | `timestamptz` | `now()` |

Derived (not stored): `market_value = shares × latest_price`, `unrealized_pnl = (latest_price − cost_basis) × shares`, `realized_pnl = (close_price − cost_basis) × shares` (when closed).

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
- **`price_snapshots` uses `date` (one row per ticker per session); `price_ticks` uses `timestamptz`.**
- **Hard delete only `profiles` rows and expired `price_ticks`.** Positions are closed, not deleted — audit trail matters.
- **`ticker` is upper-cased at write time** so joins with snapshots are case-safe.

## Seed data

`supabase/schema.sql` inserts placeholder rows for the seven committees. Edit the names/colors once the real committee list is confirmed.

## Historical import

The owner will supply an inception-to-date CSV. Expected columns:

```
ticker, name, committee, shares, cost_basis, purchased_at, closed_at, close_price, thesis
```

Import path: a one-off script under `scripts/import-history.ts` that reads the CSV, normalizes tickers, and inserts via the service role.

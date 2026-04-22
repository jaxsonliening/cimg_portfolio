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

### `price_snapshots`

Daily vendor snapshot per ticker. Written by the cron, never by users.

| column | type |
| --- | --- |
| `ticker` | `text` |
| `snapshot_date` | `date` |
| `price` | `numeric(18,4)` |
| `market_cap` | `numeric(20,2)` |
| `enterprise_value` | `numeric(20,2)` |
| `pe_ratio` | `numeric(12,4)` |
| `eps` | `numeric(12,4)` |
| `dividend_yield` | `numeric(8,6)` |
| `sector` | `text` |
| `industry` | `text` |
| `source` | `text` — `'fmp'` or `'alpha_vantage'` |
| `created_at` | `timestamptz` |

Primary key: `(ticker, snapshot_date)`.

### `fund_snapshots`

Daily aggregate for the whole fund. Written by the cron after `price_snapshots`.

| column | type |
| --- | --- |
| `snapshot_date` | `date` PK |
| `total_value` | `numeric(18,4)` — sum of open positions at close |
| `cash` | `numeric(18,4)` — cash balance (PM can update manually) |
| `created_at` | `timestamptz` |

### `benchmark_snapshots`

Daily S&P 500 (stored as `SPY` since the vendors offer it reliably).

| column | type |
| --- | --- |
| `symbol` | `text` |
| `snapshot_date` | `date` |
| `price` | `numeric(18,4)` |
| `created_at` | `timestamptz` |

Primary key: `(symbol, snapshot_date)`.

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
- **Dates, not timestamps, for snapshots.** One snapshot per day per key.
- **Hard delete only `profiles` rows.** Positions are closed, not deleted — audit trail matters.
- **`ticker` is upper-cased at write time** so joins with snapshots are case-safe.

## Seed data

`supabase/schema.sql` inserts placeholder rows for the seven committees. Edit the names/colors once the real committee list is confirmed.

## Historical import

The owner will supply an inception-to-date CSV. Expected columns:

```
ticker, name, committee, shares, cost_basis, purchased_at, closed_at, close_price, thesis
```

Import path: a one-off script under `scripts/import-history.ts` that reads the CSV, normalizes tickers, and inserts via the service role.

# Architecture

## Goals

1. Anyone can read the dashboard and the API — no account required.
2. Only the PM (and approved admins) can change positions.
3. All hosting fits inside free tiers.
4. The whole repo stays open source.
5. The dashboard doesn't go down if the market-data vendor rate-limits us.

## Components

```
  ┌──────────────┐        ┌──────────────────────────┐
  │   Browser    │──HTTP──│  Next.js on Vercel       │
  └──────────────┘        │  ├─ Server components    │
                          │  ├─ /api (public + admin)│
                          │  └─ /api/cron/snapshot   │
                          └───────────┬──────────────┘
                                      │
                 ┌────────────────────┼──────────────────────┐
                 │                    │                      │
         ┌───────▼────────┐  ┌────────▼────────┐   ┌─────────▼─────────┐
         │ Supabase Auth  │  │ Supabase Postgres│  │ Market-data vendor │
         │ (magic link)   │  │ (RLS everywhere) │  │ (FMP, Alpha V.)    │
         └────────────────┘  └──────────────────┘  └────────────────────┘
```

## Why this shape

- **Vercel + Next.js** gives us SSR, route handlers, and a cron scheduler in one deploy. Free tier covers this comfortably.
- **Supabase** gives us a real Postgres (so the public API can do joins and aggregates), email auth, and row-level security in one service. Their auto-generated REST could serve our API directly, but going through Next route handlers lets us do computed fields (daily P&L, weights) in one place and keeps the public contract stable if we ever swap the DB.
- **Daily snapshot via cron** means:
  - The UI reads from Postgres, not the vendor — fast and reliable.
  - We stay inside the vendor's free-tier call limits (one batched request per day).
  - Historical charts are just `SELECT ... FROM fund_snapshots`.

## Data flow

**Read path (public):**

1. Browser hits `/` (server component).
2. Server queries Supabase for latest `fund_snapshots`, today's `positions` joined with `price_snapshots`, and committee aggregates.
3. Charts/tables render server-side with the data already present; client components only handle interactivity (range toggles, table view switch).

**Cron path (daily, ~6pm ET):**

1. Vercel Cron hits `/api/cron/snapshot` (protected by `CRON_SECRET`).
2. Handler pulls the current ticker list from `positions`, calls FMP in one batch (quote + profile + key metrics), writes rows to `price_snapshots`.
3. Handler pulls SPY, writes a row to `benchmark_snapshots`.
4. Handler computes `fund_snapshots` for today from positions × latest price.

**Write path (PM only):**

1. PM signs in with a magic link → Supabase sets a session cookie.
2. `/admin/*` pages check `supabase.auth.getUser()` on the server; unauthenticated users get a 401 redirect.
3. Mutations go through `/api/admin/positions` route handlers that use the user's session (RLS enforces admin role), not the service-role key.

## Auth model

- Supabase `auth.users` table is the source of identity.
- A `profiles` table maps `user_id → role` (`'admin' | 'viewer'`). Only `admin` can write.
- RLS policies:
  - `positions`, `price_snapshots`, `fund_snapshots`, `benchmark_snapshots`, `committees` → `SELECT` allowed for `anon` and `authenticated`.
  - `positions` → `INSERT/UPDATE/DELETE` allowed only when `profiles.role = 'admin'` for the current `auth.uid()`.
  - Snapshot tables are write-only from the service role (cron), never from users.

## Deployment

- `main` branch auto-deploys to production on Vercel.
- Preview deploys for every PR.
- Supabase has one project (no separate staging needed at this scale); destructive migrations are rehearsed locally via `supabase start`.

## Failure modes we accept

- **Vendor outage during cron run** → yesterday's snapshot stays visible; we retry next day. The summary card shows `as_of` so staleness is obvious.
- **PM loses access to email** → Supabase dashboard can issue a new magic link manually.
- **Free tier limits hit** → upgrade Supabase (the first thing to outgrow) before Vercel.

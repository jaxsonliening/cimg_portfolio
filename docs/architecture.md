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
                          │  ├─ /api/cron/tick        │
                          │  └─ /api/cron/daily       │
                          └───────────┬──────────────┘
                                      │
           ┌──────────────────────────┼──────────────────────┐
           │                          │                      │
   ┌───────▼────────┐        ┌────────▼────────┐    ┌────────▼──────────┐
   │ Supabase Auth  │        │ Supabase Postgres│   │ Market-data vendor │
   │ (magic link)   │        │ (RLS everywhere) │   │ (FMP, Alpha V.)    │
   └────────────────┘        └──────────────────┘    └────────────────────┘
                                      ▲
                                      │ POST with bearer secret
                          ┌───────────┴──────────────┐
                          │ GitHub Actions (cron)    │
                          │  ├─ snapshot-ticks  15m  │
                          │  └─ snapshot-daily  17:00│
                          └──────────────────────────┘
```

## Why this shape

- **Vercel + Next.js** gives us SSR and route handlers in one deploy. Free tier covers this comfortably.
- **Supabase** gives us a real Postgres (so the public API can do joins and aggregates), email auth, and row-level security in one service. Their auto-generated REST could serve our API directly, but going through Next route handlers lets us do computed fields (daily P&L, weights) in one place and keeps the public contract stable if we ever swap the DB.
- **GitHub Actions as scheduler.** Vercel's free (Hobby) tier caps cron at daily; GH Actions runs every 15 minutes on the free tier, keeps the repo as the source of truth for schedules, and logs every run in the Actions tab. The workflows just POST to our own API with a shared bearer secret.
- **Two-cadence ingestion** means:
  - `price_ticks` updates every 15 min so the summary card and 1D chart feel live.
  - `price_snapshots` (daily, post-close) owns fundamentals and the official daily close — cheap to query for multi-year history.
  - The UI always reads from Postgres, never from the vendor — fast and reliable.
  - We stay well inside the vendor's free-tier call limits: ~30 batched quote calls/day for intraday + 1 fundamentals call/day.

## Data flow

**Read path (public):**

1. Browser hits `/` (server component).
2. Server queries Supabase for latest `fund_snapshots`, today's `positions` joined with `price_snapshots`, and committee aggregates.
3. Charts/tables render server-side with the data already present; client components only handle interactivity (range toggles, table view switch).

**Intraday tick path (every 15 min, Mon–Fri, US market hours):**

1. `snapshot-ticks.yml` on GitHub Actions fires on cron and POSTs to `/api/cron/tick` with `Authorization: Bearer $CRON_SECRET`.
2. Handler pulls the open-position ticker list from `positions`, calls FMP once for the batch quote, writes rows to `price_ticks` with `observed_at = now()`.
3. Same handler fetches SPY and writes to `benchmark_snapshots`.
4. Handler is a no-op (returns 200) outside market hours, so a misfire costs nothing.

**Daily close path (17:00 ET, Mon–Fri):**

1. `snapshot-daily.yml` POSTs to `/api/cron/daily`.
2. Handler fetches fundamentals (profile + key metrics) in one batched FMP call, writes `price_snapshots` with the day's close price copied from the last `price_ticks` row.
3. Handler computes `fund_snapshots` for today from open positions × daily close.
4. Handler prunes `price_ticks` rows older than 30 days so the intraday table stays small.

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

- **Vendor outage during tick run** → previous tick stays visible; next run at T+15m retries. The summary card shows `as_of` so staleness is obvious.
- **Vendor outage during daily run** → yesterday's `price_snapshots` row stays the latest close until the next daily run succeeds. The fundamentals view flags the staleness in its `as_of` field.
- **PM loses access to email** → Supabase dashboard can issue a new magic link manually.
- **Free tier limits hit** → upgrade Supabase (the first thing to outgrow) before Vercel.

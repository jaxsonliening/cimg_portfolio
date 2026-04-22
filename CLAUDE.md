# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project

**cimg_portfolio** is a public portfolio management dashboard for CIMG (a student-run investment group). It replaces an error-prone Excel workflow with a live website that anyone can view, plus a private area where the group's Portfolio Manager can add/remove positions.

Hard requirements (from the owner):

1. **Public read access** — anyone can view the dashboard without signing in.
2. **Authenticated write access** — only the group PM (and approved admins) can mutate positions.
3. **Free hosting** — deployable on free tiers only.
4. **Open source** — repo stays public on GitHub.
5. **Public data API** — all portfolio data is reachable programmatically, not just through the UI.

## Features (target scope)

- **Fund vs benchmark chart** — total fund performance vs S&P 500 since inception (inception data supplied later). Time-horizon buttons: `1M / 3M / 6M / YTD / 1Y / All`.
- **Summary table** — total portfolio value, daily P&L ($ and %), YTD P&L ($ and %), plus toggles to reframe the same stats over other horizons.
- **Committee allocation pie chart** — 7 committees, each slice = that committee's share of portfolio market value.
- **Positions table** — every current (and optionally closed) position. One toggle switches the table between two views:
  - **Portfolio view**: ticker, name, committee, shares, cost basis, purchase date, current price, market value, unrealized P&L ($ and %), weight.
  - **Fundamentals view**: ticker, market cap, enterprise value, P/E, EPS, dividend yield, sector.
- **Admin UI** — PM can add a new position (ticker, committee, shares, cost basis, date, thesis), edit it, or close it out.
- **Public API** — documented JSON endpoints for summary, performance time series, committee allocation, and positions.

## Stack (proposed)

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend + API | **Next.js 14 (App Router, TypeScript)** | One repo, server components + route handlers, deploys free on Vercel |
| UI | **Tailwind CSS + shadcn/ui** | Fast to build, looks clean, no design system to invent |
| Charts | **Recharts** | React-native, good for line + pie |
| Database | **Supabase Postgres** | Free tier, row-level security, auto-generated REST |
| Auth | **Supabase Auth (email magic link)** | PM logs in, RLS gates writes |
| Market data | **Financial Modeling Prep** (primary) with Alpha Vantage fallback | Free tiers; covers quotes + fundamentals |
| Price ingestion | **Vercel Cron** hitting `/api/cron/snapshot` once a day after US close | Stays inside free-tier call limits, keeps UI fast |
| Hosting | **Vercel** (app) + **Supabase** (DB/auth) | Both free for this size |

If the owner prefers a different stack, update this file **before** scaffolding.

## Repository layout (planned)

```
.
├── CLAUDE.md                 # this file
├── README.md                 # public project description
├── docs/
│   ├── architecture.md       # stack + deployment
│   ├── data-model.md         # DB schema & invariants
│   └── api.md                # public API contract
├── supabase/
│   └── schema.sql            # committees, positions, snapshots, RLS policies
├── app/                      # Next.js App Router (added on scaffold)
│   ├── (public)/             # public dashboard
│   ├── admin/                # PM-only UI, gated by Supabase session
│   └── api/                  # public + private route handlers
├── components/               # shared UI
├── lib/                      # supabase client, market-data client, calc helpers
└── .env.example              # required env vars
```

Anything not yet created lives only in the docs until it's scaffolded.

## Setup (when scaffolding the Next.js app)

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*"
npm i @supabase/supabase-js @supabase/ssr recharts date-fns zod
npx shadcn@latest init
```

Required env vars (put in `.env.local`; mirror non-secret keys into `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=           # server-only, never exposed to client
FMP_API_KEY=                         # Financial Modeling Prep
ALPHA_VANTAGE_API_KEY=               # fallback
```

Never log, commit, or return the service-role key to the browser.

## Data model (summary — see docs/data-model.md for full spec)

- `committees` — 7 rows, fixed at seed time, each with a display color.
- `positions` — one row per lot. Closing a position sets `closed_at` + `close_price`; rows are never hard-deleted.
- `price_snapshots` — daily `(ticker, date) → price, market_cap, ev, pe, eps, div_yield, sector`. Written by the cron.
- `fund_snapshots` — daily `(date) → total_value, cash`. Derived from positions + prices; stored for fast history queries.
- `benchmark_snapshots` — daily `(symbol, date) → price`. `symbol='SPY'` stands in for S&P 500.

## Invariants

- **Cost basis and shares are immutable after creation.** A correction is a new position row, not an update.
- **Dates are stored as `date` (no time).** Market hours are handled by the ingestion job, not the UI.
- **Money is stored as `numeric(18,4)`**, never `float`. Percentages are computed, never stored.
- **`price_snapshots` is the source of truth for "what did this cost at time T".** The UI must not call the external market API directly.
- **RLS is on for every table.** Public `SELECT` is explicit; all writes require an authenticated admin.

## API shape (public, read-only)

```
GET /api/portfolio/summary                 → { total_value, daily_pnl, daily_pct, ytd_pnl, ytd_pct, as_of }
GET /api/portfolio/performance?range=...   → { series: [{date, fund, benchmark}, ...] }
GET /api/portfolio/committees              → [{ name, value, pct, color }, ...]
GET /api/portfolio/positions               → [{ ticker, committee, shares, cost_basis, current_price, market_value, unrealized_pnl, unrealized_pct }, ...]
GET /api/portfolio/positions/:ticker       → full position + latest fundamentals
```

Admin-only (`POST/PATCH/DELETE`) endpoints live under `/api/admin/*` and require a valid Supabase session cookie.

## Conventions

- **TypeScript strict mode.** No `any` unless narrowing from an external API at the boundary.
- **Server components by default.** Drop to `"use client"` only for interactive charts/tables.
- **Calculations live in `lib/`**, not in components — so the API and UI stay consistent.
- **Tests**: add Vitest for `lib/` calc functions before the first deploy. UI tests can wait.
- **Commits**: imperative subject, short body explaining the why. One logical change per commit.

## Current branch

`claude/cimg-portfolio-dashboard-XuDlE` — all work lands here until the owner opens a PR.

## What's done / what's next

- [x] Repo bootstrap: docs, schema sketch, gitignore
- [ ] Scaffold Next.js app and install deps
- [ ] Provision Supabase project, run `supabase/schema.sql`, seed 7 committees
- [ ] Wire Supabase client + auth (magic link for PM)
- [ ] Build dashboard read path (summary, chart, pie, positions table)
- [ ] Build admin CRUD for positions
- [ ] Cron job: daily price + fundamentals snapshot
- [ ] Load inception history (owner to provide CSV)
- [ ] Deploy to Vercel, point custom domain

## Don't

- Don't fetch from the market-data vendor on every page load — always go through `price_snapshots`.
- Don't expose the service-role key to the client or echo it in API responses.
- Don't bypass RLS with the service role in user-facing route handlers.
- Don't store computed percentages or display strings in the DB.
- Don't hard-delete a position; mark it closed.

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
| Frontend + API | **Next.js 16 (App Router, TypeScript, React 19)** | One repo, server components + route handlers, deploys free on Vercel |
| UI | **Tailwind CSS + shadcn/ui** | Fast to build, looks clean, no design system to invent |
| Charts | **Recharts** | React-native, good for line + pie |
| Database | **Supabase Postgres** | Free tier, row-level security, auto-generated REST |
| Auth | **Supabase Auth (email magic link)** | PM logs in, RLS gates writes |
| Market data | **Financial Modeling Prep** (primary) with Alpha Vantage fallback | Free tiers; covers quotes + fundamentals |
| Price ingestion | **GitHub Actions** on cron, hitting `/api/cron/tick` (intraday) and `/api/cron/daily` (fundamentals) | Vercel's free tier caps cron at daily; GH Actions runs every 15 min for free |
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
├── .github/
│   └── workflows/
│       ├── snapshot-ticks.yml   # every 15 min during US market hours
│       └── snapshot-daily.yml   # once after close — fundamentals + daily totals
├── app/                      # Next.js App Router
│   ├── layout.tsx            # root layout
│   ├── page.tsx              # public dashboard
│   ├── globals.css
│   ├── admin/                # PM-only UI, gated by Supabase session  (to build)
│   └── api/                  # public + private route handlers       (to build)
├── components/               # shared UI                               (to build)
├── lib/
│   └── supabase/             # server, browser, proxy clients
├── proxy.ts                  # Next 16 proxy — refreshes Supabase session cookie
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
└── .env.example              # required env vars
```

## Setup

The app is already scaffolded. After cloning:

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
```

Other scripts: `npm run build`, `npm run lint`, `npm run typecheck`.

When we start building UI components, add shadcn/ui with `npx shadcn@latest init`.

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
- `price_ticks` — intraday `(ticker, observed_at) → price`. Written every 15 min during market hours; retained ~30 days then pruned.
- `price_snapshots` — daily `(ticker, date) → close_price, market_cap, ev, pe, eps, div_yield, sector`. Written once after close; source of truth for historical ticker prices.
- `fund_snapshots` — daily `(date) → total_value, cash`. Derived from positions + daily close; stored for fast multi-year history.
- `benchmark_snapshots` — `(symbol, observed_at) → price`. Holds both intraday ticks and daily closes for `SPY`.

## Invariants

- **Cost basis and shares are immutable after creation.** A correction is a new position row, not an update.
- **Dates are stored as `date` (no time).** Market hours are handled by the ingestion job, not the UI.
- **Money is stored as `numeric(18,4)`**, never `float`. Percentages are computed, never stored.
- **`price_ticks` is the source of truth for "current" prices; `price_snapshots` is the source of truth for historical daily closes.** The UI must not call the external market API directly.
- **RLS is on for every table.** Public `SELECT` is explicit; all writes require an authenticated admin.

## API shape (public, read-only)

```
GET /api/portfolio/summary                 → { total_value, daily_pnl, daily_pct, ytd_pnl, ytd_pct, as_of }
GET /api/portfolio/performance?range=...   → { series: [{t, fund, benchmark}, ...] }  // range ∈ 1D,1M,3M,6M,YTD,1Y,ALL — 1D uses price_ticks, others use daily snapshots
GET /api/portfolio/committees              → [{ name, value, pct, color }, ...]
GET /api/portfolio/positions               → [{ ticker, committee, shares, cost_basis, current_price, market_value, unrealized_pnl, unrealized_pct }, ...]
GET /api/portfolio/positions/:ticker       → full position + latest fundamentals
```

Admin-only (`POST/PATCH/DELETE`) endpoints live under `/api/admin/*` and require a valid Supabase session cookie.

## Conventions

- **TypeScript strict mode.** No `any` unless narrowing from an external API at the boundary.
- **Server components by default.** Drop to `"use client"` only for interactive charts/tables.
- **Calculations live in `lib/`**, not in components — so the API and UI stay consistent.
- **Next 16 idioms**: `cookies()` is async (`await cookies()`). The request-modifying file is `proxy.ts`, not `middleware.ts`.
- **Tests**: add Vitest for `lib/` calc functions before the first deploy. UI tests can wait.
- **Commits**: imperative subject, short body explaining the why. One logical change per commit.

## Current branch

`claude/cimg-portfolio-dashboard-XuDlE` — all work lands here until the owner opens a PR.

## What's done / what's next

- [x] Repo bootstrap: docs, schema sketch, gitignore
- [x] Scaffold Next.js 16 app + Tailwind + Supabase clients + proxy
- [x] Schema + auth trigger + DB types + setup guide (`docs/setup-supabase.md`)
- [x] Magic-link login + admin auth gate (`/admin/login`, `/auth/callback`, `/admin`)
- [x] Public API: `/summary`, `/performance`, `/committees`, `/positions`, `/positions/:ticker`
- [x] Shared query layer in `lib/portfolio/` (summary/committees/positions) so the dashboard and API share one source of truth
- [x] Admin CRUD for positions (`POST /api/admin/positions`, `PATCH .../:id` close) + inline UI
- [x] Cron handlers: `/api/cron/tick`, `/api/cron/daily` (FMP client, market-hours check, service-role writes)
- [x] Dashboard UI wired to real data — summary cards, performance chart with range toggle, committee pie, positions table with portfolio/fundamentals toggle
- [ ] Provision Supabase project, run `supabase/schema.sql`, seed 7 committees *(manual step — see `docs/setup-supabase.md`)*
- [ ] Configure GitHub repo secrets `APP_URL` + `CRON_SECRET` and Vercel env vars *(manual step)*
- [ ] Backfill inception history from CSV once the owner provides it
- [ ] Vitest coverage for `lib/calc/` (committee allocations, intraday fund series) before first deploy
- [ ] Build admin CRUD for positions
- [ ] GitHub Actions: 15-min intraday ticks + daily fundamentals snapshot
- [ ] Tick retention job (prune `price_ticks` older than 30 days)
- [ ] Load inception history (owner to provide CSV)
- [ ] Deploy to Vercel, point custom domain

## Don't

- Don't fetch from the market-data vendor on every page load — always go through `price_snapshots`.
- Don't expose the service-role key to the client or echo it in API responses.
- Don't bypass RLS with the service role in user-facing route handlers.
- Don't store computed percentages or display strings in the DB.
- Don't hard-delete a position; mark it closed.

# cimg_portfolio

Public portfolio management dashboard for **CIMG**. Replaces a spreadsheet with a live site that anyone can view and a secure admin area where the group's Portfolio Manager maintains positions.

## What it shows

- **Fund vs S&P 500** performance chart since inception, with `1M / 3M / 6M / YTD / 1Y / All` toggles
- **Summary stats** — total portfolio value, daily P&L, daily %, YTD P&L, YTD %
- **Committee allocation** pie chart (7 committees)
- **Positions table** with a one-click toggle between:
  - Portfolio view — cost basis, purchase date, committee, current market value, unrealized P&L
  - Fundamentals view — market cap, enterprise value, P/E, EPS, dividend yield, sector
- **Public JSON API** — every number on the page is reachable programmatically

## Stack

- [Next.js 14](https://nextjs.org) (App Router, TypeScript) on [Vercel](https://vercel.com) free tier
- [Supabase](https://supabase.com) Postgres + Auth for data and PM login (free tier)
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) + [Recharts](https://recharts.org)
- Market data from [Financial Modeling Prep](https://financialmodelingprep.com) with Alpha Vantage as fallback
- Daily price snapshot job runs as a Vercel Cron

## Getting started

> The Next.js app hasn't been scaffolded yet — this repo currently holds the plan, schema, and API contract. Run the steps below to bring it online.

```bash
# 1. Scaffold the app into this directory
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*"

# 2. Install runtime deps
npm i @supabase/supabase-js @supabase/ssr recharts date-fns zod

# 3. Set up shadcn/ui
npx shadcn@latest init

# 4. Create a Supabase project, then run the schema
#    (copy supabase/schema.sql into the Supabase SQL editor, or use the CLI)

# 5. Copy env template and fill in values
cp .env.example .env.local

# 6. Run locally
npm run dev
```

## Docs

- [`docs/architecture.md`](docs/architecture.md) — stack, hosting, data flow
- [`docs/data-model.md`](docs/data-model.md) — database schema and invariants
- [`docs/api.md`](docs/api.md) — public API contract
- [`CLAUDE.md`](CLAUDE.md) — guidance for Claude Code working in this repo

## License

MIT. See [`LICENSE`](LICENSE).

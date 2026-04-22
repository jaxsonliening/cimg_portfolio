# Public API

All endpoints return JSON, allow CORS from `*`, and require no authentication. They are served by Next.js route handlers under `/api/portfolio/*` and read exclusively from Supabase — never directly from the market-data vendor.

Admin endpoints under `/api/admin/*` require a Supabase session cookie and are not listed here.

## `GET /api/portfolio/summary`

Top-of-page stats.

```json
{
  "as_of": "2026-04-22",
  "total_value": 184230.41,
  "cash": 2104.10,
  "daily_pnl": 1421.88,
  "daily_pct": 0.00778,
  "ytd_pnl": 12044.20,
  "ytd_pct": 0.0699,
  "inception_pnl": 34120.88,
  "inception_pct": 0.2271,
  "dividend_income_ytd": 412.30,
  "dividend_income_total": 2104.75
}
```

`daily_pnl` / `ytd_pnl` / `inception_pnl` are `null` until the matching historical `fund_snapshots` row exists. `dividend_income_*` are summed directly from `cash_transactions` where `kind='dividend'`.

## `GET /api/portfolio/performance?range=1D|1M|3M|6M|YTD|1Y|ALL`

Time series for the fund-vs-benchmark chart. Default `range=YTD`.

- `1D` reads from `price_ticks` and `benchmark_snapshots` (intraday rows); `t` is an ISO timestamp.
- All other ranges read from daily `fund_snapshots` joined to `benchmark_snapshots` where `is_daily_close = true`; `t` is an ISO date.

```json
{
  "range": "YTD",
  "series": [
    { "t": "2026-01-02",          "fund": 172186.21, "benchmark": 100.00 },
    { "t": "2026-01-03",          "fund": 173002.55, "benchmark": 100.42 }
  ]
}
```

```json
{
  "range": "1D",
  "series": [
    { "t": "2026-04-22T13:30:00Z", "fund": 184012.10, "benchmark": 100.00 },
    { "t": "2026-04-22T13:45:00Z", "fund": 184221.44, "benchmark": 100.05 }
  ]
}
```

Benchmark is normalized to `100` at the start of the requested range so the two lines share a y-axis in the UI.

## `GET /api/portfolio/committees`

Pie chart data.

```json
[
  { "id": "tech", "name": "Technology", "color": "#3b82f6", "value": 52104.22, "pct": 0.283 },
  { "id": "consumer", "name": "Consumer", "color": "#f59e0b", "value": 28311.04, "pct": 0.154 }
]
```

`pct` sums to `1.0` across all seven committees (cash is excluded).

## `GET /api/portfolio/positions`

One row per ticker. All buy lots are aggregated; `avg_cost_basis` is the weighted cost basis across remaining shares after FIFO-allocating sells. Fully-sold tickers are excluded by default; pass `?include=closed` to include them.

```json
[
  {
    "ticker": "AAPL",
    "name": "Apple Inc.",
    "committee": { "id": "tech", "name": "Technology" },
    "shares_remaining": 18,
    "avg_cost_basis": 145.50,
    "current_price": 198.44,
    "market_value": 3571.92,
    "unrealized_pnl": 952.92,
    "unrealized_pct": 0.3639,
    "realized_pnl": 120.00,
    "weight": 0.0195,
    "lots": [
      { "id": "8b9...", "shares": 12, "cost_basis": 142.10, "purchased_at": "2024-09-17", "remaining_shares": 10, "realized_pnl": 120.00 },
      { "id": "1c3...", "shares": 8,  "cost_basis": 150.60, "purchased_at": "2025-03-04", "remaining_shares": 8,  "realized_pnl": 0 }
    ]
  }
]
```

## `GET /api/portfolio/positions/:ticker`

All lots for a ticker plus the latest fundamentals. One ticker can have multiple lots (the data model treats corrections as new rows rather than edits), so the response returns a `lots` array ordered by purchase date.

```json
{
  "ticker": "AAPL",
  "name": "Apple Inc.",
  "current_price": 198.44,
  "lots": [
    {
      "id": "8b9...",
      "committee": { "id": "tech", "name": "Technology" },
      "shares": 12,
      "cost_basis": 142.10,
      "purchased_at": "2024-09-17",
      "thesis": "...",
      "closed_at": null,
      "close_price": null,
      "market_value": 2381.28,
      "unrealized_pnl": 676.08,
      "unrealized_pct": 0.3964,
      "realized_pnl": null
    }
  ],
  "fundamentals": {
    "market_cap": 3010000000000,
    "enterprise_value": 3040000000000,
    "pe_ratio": 32.1,
    "eps": 6.18,
    "dividend_yield": 0.0049,
    "sector": "Technology",
    "industry": "Consumer Electronics",
    "as_of": "2026-04-22"
  }
}
```

Closed lots have `closed_at`, `close_price`, and `realized_pnl` populated; their `market_value` / `unrealized_*` are `null`.

## Errors

```json
{ "error": "unknown_ticker", "message": "No position found for ticker FOOBAR" }
```

Status codes follow the usual conventions: `200` success, `400` bad query, `404` not found, `429` rate limited, `500` server error. The API is cached at the edge for 60 seconds on successful `GET` responses — short enough that each 15-min tick propagates on the next request after it lands.

## Versioning

The path is unversioned for now. Any breaking change gets a `/api/v2/...` prefix; the old path stays live for at least one quarter.

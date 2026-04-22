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
  "inception_pct": 0.2271
}
```

## `GET /api/portfolio/performance?range=1M|3M|6M|YTD|1Y|ALL`

Time series for the fund-vs-benchmark chart. Default `range=YTD`.

```json
{
  "range": "YTD",
  "series": [
    { "date": "2026-01-02", "fund": 172186.21, "benchmark": 100.00 },
    { "date": "2026-01-03", "fund": 173002.55, "benchmark": 100.42 }
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

All current positions (closed positions excluded by default; pass `?include=closed` to include them).

```json
[
  {
    "id": "8b9...",
    "ticker": "AAPL",
    "name": "Apple Inc.",
    "committee": { "id": "tech", "name": "Technology" },
    "shares": 12,
    "cost_basis": 142.10,
    "purchased_at": "2024-09-17",
    "current_price": 198.44,
    "market_value": 2381.28,
    "unrealized_pnl": 676.08,
    "unrealized_pct": 0.3964,
    "weight": 0.0129,
    "as_of": "2026-04-22"
  }
]
```

## `GET /api/portfolio/positions/:ticker`

Single position with latest fundamentals.

```json
{
  "ticker": "AAPL",
  "name": "Apple Inc.",
  "committee": { "id": "tech", "name": "Technology" },
  "shares": 12,
  "cost_basis": 142.10,
  "purchased_at": "2024-09-17",
  "thesis": "...",
  "current_price": 198.44,
  "market_value": 2381.28,
  "unrealized_pnl": 676.08,
  "unrealized_pct": 0.3964,
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

## Errors

```json
{ "error": "unknown_ticker", "message": "No position found for ticker FOOBAR" }
```

Status codes follow the usual conventions: `200` success, `400` bad query, `404` not found, `429` rate limited, `500` server error. The API is cached at the edge for 60 seconds on successful `GET` responses.

## Versioning

The path is unversioned for now. Any breaking change gets a `/api/v2/...` prefix; the old path stays live for at least one quarter.

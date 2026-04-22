import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchQuotes } from "@/lib/market/fmp";
import { isWithinMarketHours } from "@/lib/market/hours";
import { getActiveTickers } from "@/lib/portfolio/active-tickers";

const BENCHMARK = "SPY";

export async function POST(request: Request) {
  const authFail = checkAuth(request);
  if (authFail) return authFail;

  if (!isWithinMarketHours()) {
    return NextResponse.json({ status: "skipped", reason: "outside_market_hours" });
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    return fail("config_error", err);
  }

  let tickers: string[];
  try {
    tickers = await getActiveTickers(supabase);
  } catch (err) {
    return fail("positions_query_failed", err);
  }
  const symbols = Array.from(new Set([...tickers, BENCHMARK]));

  let quotes;
  try {
    quotes = await fetchQuotes(symbols);
  } catch (err) {
    return fail("fmp_quote_failed", err);
  }

  const now = new Date().toISOString();
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));

  const tickRows = tickers
    .map((t) => bySymbol.get(t))
    .filter((q): q is NonNullable<typeof q> => q !== undefined)
    .map((q) => ({
      ticker: q.symbol,
      observed_at: now,
      price: q.price,
      source: "fmp",
    }));

  const spy = bySymbol.get(BENCHMARK);
  const benchmarkRow = spy
    ? {
        symbol: BENCHMARK,
        observed_at: now,
        price: spy.price,
        is_daily_close: false,
      }
    : null;

  const [tickRes, benchRes] = await Promise.all([
    tickRows.length
      ? supabase.from("price_ticks").upsert(tickRows)
      : Promise.resolve({ error: null }),
    benchmarkRow
      ? supabase.from("benchmark_snapshots").upsert(benchmarkRow)
      : Promise.resolve({ error: null }),
  ]);
  if (tickRes.error) return fail("tick_insert_failed", tickRes.error);
  if (benchRes.error) return fail("benchmark_insert_failed", benchRes.error);

  return NextResponse.json({
    status: "ok",
    at: now,
    tickers: tickRows.length,
    benchmark: benchmarkRow !== null,
    missing: symbols.filter((s) => !bySymbol.has(s)),
  });
}

function checkAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 500 });
  }
  if (request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function fail(code: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: code, message }, { status: 500 });
}

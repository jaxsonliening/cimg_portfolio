import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchQuotes } from "@/lib/market/fmp";
import { getActiveTickers } from "@/lib/portfolio/active-tickers";

const BENCHMARK = "SPY";

// Intraday price tick. Called by .github/workflows/snapshot-ticks.yml every
// 15 min on weekdays 13:00-21:15 UTC (US RTH plus pre/post-close). The
// workflow schedule is the market-hours gate — we don't re-check here
// because a silent-skip response reads as 200 OK in Actions logs, masking
// failures and leaving Supabase empty while Actions shows green.

export async function POST(request: Request) {
  const authFail = checkAuth(request);
  if (authFail) return authFail;

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
    tickers_requested: tickers.length,
    tickers_written: tickRows.length,
    benchmark_written: benchmarkRow !== null,
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
  return NextResponse.json({ error: code, message: errMessage(err) }, { status: 500 });
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  // Supabase / PostgREST errors are plain objects with .message, .code,
  // .hint, .details — not Error instances. String(err) on those returns
  // "[object Object]", so unpack the useful fields explicitly.
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    const parts = [o.message, o.code, o.details, o.hint]
      .filter((x) => x !== undefined && x !== null && x !== "")
      .map((x) => String(x));
    if (parts.length) return parts.join(" | ");
  }
  return String(err);
}

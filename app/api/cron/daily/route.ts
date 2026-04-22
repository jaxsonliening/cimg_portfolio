import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchQuotes, fetchProfiles } from "@/lib/market/fmp";
import { getActiveSharesByTicker } from "@/lib/portfolio/active-tickers";

const BENCHMARK = "SPY";
const TICK_RETENTION_DAYS = 30;

export async function POST(request: Request) {
  const authFail = checkAuth(request);
  if (authFail) return authFail;

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    return fail("config_error", err);
  }

  let sharesByTicker: Map<string, number>;
  try {
    sharesByTicker = await getActiveSharesByTicker(supabase);
  } catch (err) {
    return fail("positions_query_failed", err);
  }

  const tickers = Array.from(sharesByTicker.keys());
  const symbols = Array.from(new Set([...tickers, BENCHMARK]));

  const [quotes, profiles] = await Promise.all([
    fetchQuotes(symbols).catch((err: unknown) => ({ __err: err }) as const),
    tickers.length
      ? fetchProfiles(tickers).catch((err: unknown) => ({ __err: err }) as const)
      : Promise.resolve([]),
  ]);
  if ("__err" in quotes) return fail("fmp_quote_failed", quotes.__err);
  if (!Array.isArray(profiles)) return fail("fmp_profile_failed", profiles.__err);

  const quotesBySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  const profilesBySymbol = new Map(profiles.map((p) => [p.symbol, p]));

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const snapshotRows = tickers
    .map((t) => {
      const q = quotesBySymbol.get(t);
      if (!q) return null;
      const p = profilesBySymbol.get(t);
      return {
        ticker: t,
        snapshot_date: today,
        close_price: q.price,
        market_cap: q.marketCap,
        enterprise_value: null,
        pe_ratio: q.pe,
        eps: q.eps,
        dividend_yield: null,
        sector: p?.sector ?? null,
        industry: p?.industry ?? null,
        source: "fmp",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const spy = quotesBySymbol.get(BENCHMARK);
  const benchmarkRow = spy
    ? {
        symbol: BENCHMARK,
        observed_at: now.toISOString(),
        price: spy.price,
        is_daily_close: true,
      }
    : null;

  let fundValue = 0;
  for (const [ticker, shares] of sharesByTicker) {
    const q = quotesBySymbol.get(ticker);
    if (q) fundValue += shares * q.price;
  }

  // Cash is the running sum of every cash_transactions row up through today.
  const { data: cashRows, error: cashError } = await supabase
    .from("cash_transactions")
    .select("amount")
    .lte("occurred_at", today);
  if (cashError) return fail("cash_query_failed", cashError);
  const cash = (cashRows ?? []).reduce((sum, r) => sum + r.amount, 0);

  const fundRow = {
    snapshot_date: today,
    total_value: Math.round((fundValue + cash) * 10000) / 10000,
    cash: Math.round(cash * 10000) / 10000,
  };

  const pruneCutoff = new Date(
    now.getTime() - TICK_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [snapshotRes, benchRes, fundRes, pruneRes] = await Promise.all([
    snapshotRows.length
      ? supabase.from("price_snapshots").upsert(snapshotRows)
      : Promise.resolve({ error: null }),
    benchmarkRow
      ? supabase.from("benchmark_snapshots").upsert(benchmarkRow)
      : Promise.resolve({ error: null }),
    supabase.from("fund_snapshots").upsert(fundRow),
    supabase.from("price_ticks").delete().lt("observed_at", pruneCutoff),
  ]);
  if (snapshotRes.error) return fail("snapshot_insert_failed", snapshotRes.error);
  if (benchRes.error) return fail("benchmark_insert_failed", benchRes.error);
  if (fundRes.error) return fail("fund_insert_failed", fundRes.error);
  if (pruneRes.error) return fail("tick_prune_failed", pruneRes.error);

  return NextResponse.json({
    status: "ok",
    date: today,
    snapshots: snapshotRows.length,
    benchmark: benchmarkRow !== null,
    fund_total_value: fundRow.total_value,
    missing_quotes: symbols.filter((s) => !quotesBySymbol.has(s)),
    pruned_ticks_before: pruneCutoff,
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

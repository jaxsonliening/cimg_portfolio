import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchFullQuotes, fetchProfiles } from "@/lib/market/fmp";
import { getActiveSharesByTicker } from "@/lib/portfolio/active-tickers";
import { isTradingDay } from "@/lib/calc/nyse-holidays";

const BENCHMARK = "SPY";
const TICK_RETENTION_DAYS = 30;

export async function POST(request: Request) {
  const authFail = checkAuth(request);
  if (authFail) return authFail;

  // Refuse to run on non-trading days. The scheduled GitHub Actions
  // workflow already restricts to Mon-Fri, but holidays (Memorial Day,
  // July 4, Thanksgiving, Christmas, etc.) still trigger the cron;
  // Yahoo on a closed session returns the previous day's close, and
  // writing that under today's date corrupts summary.as_of and the
  // chart's most-recent point. Bail with a 200 + skipped status so
  // manual runs and accidental holiday triggers are obvious.
  const runAt = new Date();
  if (!isTradingDay(runAt)) {
    return NextResponse.json({
      status: "skipped",
      reason: "non_trading_day",
      date: runAt.toISOString().slice(0, 10),
    });
  }

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
    fetchFullQuotes(symbols).catch((err: unknown) => ({ __err: err }) as const),
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
        enterprise_value: p?.enterpriseValue ?? null,
        pe_ratio: q.pe,
        forward_pe: q.forwardPe,
        eps: q.eps,
        dividend_yield: q.dividendYield,
        price_to_book: p?.priceToBook ?? null,
        ev_to_ebitda: p?.evToEbitda ?? null,
        roe: p?.roe ?? null,
        beta: p?.beta ?? null,
        sector: p?.sector ?? null,
        industry: p?.industry ?? null,
        source: "fmp",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Canonical close timestamp (16:00 ET = 20:00 UTC). Re-runs of the
  // daily cron then collide on the (symbol, observed_at) primary key
  // and upsert overwrites the prior close cleanly — using `now()` here
  // produced a fresh observed_at each run, which slipped past the PK
  // and tripped the partial unique index on (symbol, close_date)
  // where is_daily_close.
  const spy = quotesBySymbol.get(BENCHMARK);
  const benchmarkRow = spy
    ? {
        symbol: BENCHMARK,
        observed_at: `${today}T20:00:00Z`,
        price: spy.price,
        is_daily_close: true,
        close_date: today,
      }
    : null;

  // Refuse to write a fund_snapshot when Yahoo failed to return a quote
  // for any current holding — without this we silently drop those tickers
  // from equity and write a row that's, e.g., $1.2M instead of $2.5M
  // (observed on 2026-04-24). Reconstruction or tomorrow's cron can fill
  // the day in cleanly; a missing row is far less harmful than a wrong
  // one because the chart anchors normalization to it.
  const missingHoldingQuotes = Array.from(sharesByTicker.keys()).filter(
    (t) => !quotesBySymbol.has(t),
  );
  if (missingHoldingQuotes.length > 0) {
    return fail(
      "fund_value_incomplete",
      `Yahoo did not return quotes for: ${missingHoldingQuotes.join(", ")}`,
    );
  }

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

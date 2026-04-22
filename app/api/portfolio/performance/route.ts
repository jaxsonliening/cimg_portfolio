import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildIntradayFundSeries,
  normalizeToHundred,
  type Tick,
} from "@/lib/calc/performance";
import { getActiveSharesByTicker } from "@/lib/portfolio/active-tickers";

export const revalidate = 60;

const RANGES = ["1D", "1M", "3M", "6M", "YTD", "1Y", "ALL"] as const;
type Range = (typeof RANGES)[number];
const BENCHMARK = "SPY";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = (searchParams.get("range") ?? "YTD").toUpperCase() as Range;

  if (!RANGES.includes(range)) {
    return NextResponse.json(
      {
        error: "invalid_range",
        message: `range must be one of ${RANGES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  if (range === "1D") {
    return intradaySeries(supabase);
  }
  return dailySeries(supabase, range);
}

async function intradaySeries(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  // Pick the most recent session with any ticks so weekends and holidays
  // still show the last trading day's intraday line.
  const { data: latestTick, error: latestErr } = await supabase
    .from("price_ticks")
    .select("observed_at")
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) return fail("ticks_query_failed", latestErr.message);
  if (!latestTick) return series([], "1D");

  const sessionDate = latestTick.observed_at.slice(0, 10);
  const dayStart = `${sessionDate}T00:00:00Z`;
  const dayEnd = `${sessionDate}T23:59:59.999Z`;

  let sharesByTicker: Map<string, number>;
  try {
    sharesByTicker = await getActiveSharesByTicker(supabase);
  } catch (err) {
    return fail(
      "positions_query_failed",
      err instanceof Error ? err.message : "unknown",
    );
  }

  const positions = Array.from(sharesByTicker.entries()).map(
    ([ticker, shares]) => ({ ticker, shares }),
  );
  const tickers = positions.map((p) => p.ticker);

  const [ticksRes, benchmarkRes] = await Promise.all([
    tickers.length
      ? supabase
          .from("price_ticks")
          .select("ticker, observed_at, price")
          .in("ticker", tickers)
          .gte("observed_at", dayStart)
          .lte("observed_at", dayEnd)
          .order("observed_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("benchmark_snapshots")
      .select("observed_at, price")
      .eq("symbol", BENCHMARK)
      .gte("observed_at", dayStart)
      .lte("observed_at", dayEnd)
      .order("observed_at", { ascending: true }),
  ]);
  if (ticksRes.error) return fail("ticks_query_failed", ticksRes.error.message);
  if (benchmarkRes.error) return fail("benchmark_query_failed", benchmarkRes.error.message);

  const ticksByTicker = new Map<string, Tick[]>();
  for (const t of ticksRes.data ?? []) {
    const arr = ticksByTicker.get(t.ticker) ?? [];
    arr.push({ observed_at: t.observed_at, price: t.price });
    ticksByTicker.set(t.ticker, arr);
  }

  const fundSeries = buildIntradayFundSeries(positions, ticksByTicker);
  const benchmarkNormalized = normalizeToHundred(
    benchmarkRes.data.map((r) => ({ t: r.observed_at, price: r.price })),
  );

  const benchmarkAtOrBefore = asOfLookup(benchmarkNormalized);
  const series_ = fundSeries.map((f) => ({
    t: f.t,
    fund: f.fund,
    benchmark: benchmarkAtOrBefore(f.t),
  }));

  return series(series_, "1D");
}

async function dailySeries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  range: Exclude<Range, "1D">,
) {
  const now = new Date();
  const start = rangeStart(range, now);
  const startDate = start ? start.toISOString().slice(0, 10) : null;

  let fundQuery = supabase
    .from("fund_snapshots")
    .select("snapshot_date, total_value")
    .order("snapshot_date", { ascending: true });
  if (startDate) fundQuery = fundQuery.gte("snapshot_date", startDate);

  const startTimestamp = start ? start.toISOString() : null;
  let benchmarkQuery = supabase
    .from("benchmark_snapshots")
    .select("observed_at, price")
    .eq("symbol", BENCHMARK)
    .eq("is_daily_close", true)
    .order("observed_at", { ascending: true });
  if (startTimestamp) benchmarkQuery = benchmarkQuery.gte("observed_at", startTimestamp);

  const [fundRes, benchmarkRes] = await Promise.all([fundQuery, benchmarkQuery]);
  if (fundRes.error) return fail("fund_query_failed", fundRes.error.message);
  if (benchmarkRes.error) return fail("benchmark_query_failed", benchmarkRes.error.message);

  const benchmarkByDate = new Map<string, number>();
  for (const row of benchmarkRes.data) {
    benchmarkByDate.set(row.observed_at.slice(0, 10), row.price);
  }

  // Inner-join by date so we never draw half a point.
  const aligned = fundRes.data
    .map((f) => {
      const benchmarkPrice = benchmarkByDate.get(f.snapshot_date);
      return benchmarkPrice === undefined
        ? null
        : { t: f.snapshot_date, fund: f.total_value, benchmarkPrice };
    })
    .filter(<T,>(x: T | null): x is T => x !== null);

  if (aligned.length === 0) return series([], range);

  const base = aligned[0].benchmarkPrice;
  const series_ = aligned.map((a) => ({
    t: a.t,
    fund: round2(a.fund),
    benchmark:
      base === 0 ? 0 : Math.round(((a.benchmarkPrice / base) * 100) * 100) / 100,
  }));

  return series(series_, range);
}

function rangeStart(range: Exclude<Range, "1D">, now: Date): Date | null {
  if (range === "ALL") return null;
  if (range === "YTD") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const days = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365 }[range];
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function asOfLookup(
  rows: { t: string; value: number }[],
): (t: string) => number | null {
  // rows are sorted ascending by t; return the latest value with t' <= t.
  return (t) => {
    let latest: number | null = null;
    for (const r of rows) {
      if (r.t <= t) latest = r.value;
      else break;
    }
    return latest;
  };
}

function series(
  series: unknown[],
  range: Range,
) {
  return NextResponse.json(
    { range, series },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function fail(code: string, message: string) {
  return NextResponse.json({ error: code, message }, { status: 500 });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { latestPricesFor } from "@/lib/queries/latest-prices";
import {
  allocateTradesFifo,
  averageCostBasis,
  type Lot,
} from "@/lib/calc/lots";

// Detail view for a single ticker: everything we know, scoped.
//
// Returns null when the ticker isn't (and has never been) held, so
// the route can 404 rather than render an empty page. Otherwise
// exposes summary stats, the flat lot + trade history, analyst meta,
// latest fundamentals, and a normalized CIMG-vs-SPY % change series
// since the earliest purchase of this lot. The chart points pair a
// per-share price for the ticker with the SPY close on the same
// trading day so both lines can normalize to 0% at the purchase date.

export type PositionDetail = {
  ticker: string;
  name: string;
  committee: { id: string; name: string; color: string | null } | null;

  shares_held: number;
  avg_cost: number | null;
  current_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pct: number | null;
  realized_pnl: number;
  total_dividends: number;

  target_weight: number | null;
  intrinsic_value: number | null;
  v_over_p: number | null;
  value_updated_at: string | null;

  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  pe_ratio: number | null;
  eps: number | null;
  dividend_yield: number | null;

  initial_purchase: string | null;
  thesis: string | null;

  lots: Array<{
    id: string;
    purchased_at: string;
    shares: number;
    cost_basis: number;
    remaining_shares: number;
    thesis: string | null;
  }>;
  trades: Array<{
    traded_at: string;
    shares: number;
    price: number;
    note: string | null;
  }>;
  dividends: Array<{
    occurred_at: string;
    amount: number;
    note: string | null;
  }>;
  chart: Array<{
    t: string;
    ticker_pct: number | null;
    spy_pct: number | null;
  }>;
};

export async function getPositionDetail(
  supabase: SupabaseClient<Database>,
  rawTicker: string,
): Promise<PositionDetail | null> {
  const ticker = rawTicker.toUpperCase();

  const [lotsRes, tradesRes, metaRes, dividendsRes, committeesRes] =
    await Promise.all([
      supabase
        .from("positions")
        .select("id, ticker, name, committee_id, shares, cost_basis, purchased_at, thesis")
        .eq("ticker", ticker)
        .order("purchased_at", { ascending: true }),
      supabase
        .from("trades")
        .select("ticker, shares, price, traded_at, note")
        .eq("ticker", ticker)
        .order("traded_at", { ascending: true }),
      supabase
        .from("ticker_meta")
        .select("ticker, target_weight, intrinsic_value, value_updated_at")
        .eq("ticker", ticker)
        .maybeSingle(),
      supabase
        .from("cash_transactions")
        .select("amount, occurred_at, note, kind")
        .eq("kind", "dividend")
        .eq("ticker", ticker)
        .order("occurred_at", { ascending: false }),
      supabase.from("committees").select("id, name, color"),
    ]);

  if (lotsRes.error) throw lotsRes.error;
  if (tradesRes.error) throw tradesRes.error;
  if (metaRes.error) throw metaRes.error;
  if (dividendsRes.error) throw dividendsRes.error;
  if (committeesRes.error) throw committeesRes.error;

  const lots = lotsRes.data ?? [];
  const trades = tradesRes.data ?? [];
  if (lots.length === 0) return null;

  const plainLots: Lot[] = lots.map((l) => ({
    id: l.id,
    ticker: l.ticker,
    shares: l.shares,
    cost_basis: l.cost_basis,
    purchased_at: l.purchased_at,
  }));
  const allocated = allocateTradesFifo(plainLots, trades);
  const sharesHeld = allocated.reduce((s, a) => s + a.remaining_shares, 0);
  const realizedPnl = allocated.reduce((s, a) => s + a.realized_pnl, 0);
  const avgCost = averageCostBasis(allocated);

  const committeeRow = committeesRes.data.find(
    (c) => c.id === lots[0].committee_id,
  );
  const committee = committeeRow
    ? {
        id: committeeRow.id,
        name: committeeRow.name,
        color: committeeRow.color ?? null,
      }
    : null;

  const prices = await latestPricesFor(supabase, [ticker]);
  const currentPrice = prices.get(ticker) ?? null;
  const marketValue =
    currentPrice === null ? null : round2(sharesHeld * currentPrice);
  const unrealizedPnl =
    currentPrice === null || avgCost === null
      ? null
      : round2(sharesHeld * (currentPrice - avgCost));
  const unrealizedPct =
    unrealizedPnl === null || avgCost === null || avgCost === 0
      ? null
      : (currentPrice! - avgCost) / avgCost;

  const totalDividends = (dividendsRes.data ?? []).reduce(
    (s, r) => s + Number(r.amount),
    0,
  );

  // Fundamentals: pull the latest non-null values from price_snapshots
  // for this ticker. Same logic as lib/portfolio/positions.ts but scoped.
  const { data: snapRows } = await supabase
    .from("price_snapshots")
    .select(
      "snapshot_date, close_price, market_cap, enterprise_value, pe_ratio, eps, dividend_yield, sector, industry",
    )
    .eq("ticker", ticker)
    .order("snapshot_date", { ascending: true });
  const f = {
    market_cap: null as number | null,
    pe_ratio: null as number | null,
    eps: null as number | null,
    dividend_yield: null as number | null,
    sector: null as string | null,
    industry: null as string | null,
  };
  const rows = snapRows ?? [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (f.market_cap === null && r.market_cap !== null) f.market_cap = r.market_cap;
    if (f.pe_ratio === null && r.pe_ratio !== null) f.pe_ratio = r.pe_ratio;
    if (f.eps === null && r.eps !== null) f.eps = r.eps;
    if (f.dividend_yield === null && r.dividend_yield !== null) f.dividend_yield = r.dividend_yield;
    if (f.sector === null && r.sector !== null) f.sector = r.sector;
    if (f.industry === null && r.industry !== null) f.industry = r.industry;
    if (
      f.market_cap !== null &&
      f.pe_ratio !== null &&
      f.eps !== null &&
      f.dividend_yield !== null &&
      f.sector !== null &&
      f.industry !== null
    ) break;
  }

  const initialPurchase = plainLots[0]?.purchased_at ?? null;

  // Chart: % change for this ticker and SPY since initial_purchase,
  // using the first snapshot_date >= initial_purchase as the 0% anchor.
  const chart = await buildChart(supabase, ticker, initialPurchase, rows);

  const intrinsicValue = metaRes.data?.intrinsic_value ?? null;
  const vOverP =
    intrinsicValue === null || currentPrice === null || currentPrice === 0
      ? null
      : intrinsicValue / currentPrice;

  return {
    ticker,
    name: lots[0].name,
    committee,
    shares_held: round4(sharesHeld),
    avg_cost: avgCost,
    current_price: currentPrice,
    market_value: marketValue,
    unrealized_pnl: unrealizedPnl,
    unrealized_pct: unrealizedPct,
    realized_pnl: round2(realizedPnl),
    total_dividends: round2(totalDividends),

    target_weight: metaRes.data?.target_weight ?? null,
    intrinsic_value: intrinsicValue,
    v_over_p: vOverP,
    value_updated_at: metaRes.data?.value_updated_at ?? null,

    sector: f.sector,
    industry: f.industry,
    market_cap: f.market_cap,
    pe_ratio: f.pe_ratio,
    eps: f.eps,
    dividend_yield: f.dividend_yield,

    initial_purchase: initialPurchase,
    thesis: lots[0].thesis ?? null,

    lots: allocated.map((a) => ({
      id: a.id,
      purchased_at: a.purchased_at,
      shares: a.shares,
      cost_basis: a.cost_basis,
      remaining_shares: round4(a.remaining_shares),
      thesis:
        lots.find((l) => l.id === a.id)?.thesis ?? null,
    })),
    trades: trades.map((t) => ({
      traded_at: t.traded_at,
      shares: t.shares,
      price: t.price,
      note: t.note ?? null,
    })),
    dividends: (dividendsRes.data ?? []).map((d) => ({
      occurred_at: d.occurred_at,
      amount: Number(d.amount),
      note: d.note ?? null,
    })),
    chart,
  };
}

type TickerSnapshot = {
  snapshot_date: string;
  close_price: number;
};

async function buildChart(
  supabase: SupabaseClient<Database>,
  ticker: string,
  initialPurchase: string | null,
  tickerSnapshots: TickerSnapshot[],
): Promise<PositionDetail["chart"]> {
  if (!initialPurchase || tickerSnapshots.length === 0) return [];

  const { data: spyRows } = await supabase
    .from("benchmark_snapshots")
    .select("close_date, observed_at, price")
    .eq("symbol", "SPY")
    .eq("is_daily_close", true)
    .gte("observed_at", `${initialPurchase}T00:00:00Z`)
    .order("observed_at", { ascending: true });

  const spyByDate = new Map<string, number>();
  for (const row of spyRows ?? []) {
    const date = row.close_date ?? row.observed_at.slice(0, 10);
    spyByDate.set(date, Number(row.price));
  }

  const tickerSinceStart = tickerSnapshots.filter(
    (r) => r.snapshot_date >= initialPurchase,
  );
  if (tickerSinceStart.length === 0) return [];

  const firstTickerPrice = tickerSinceStart[0].close_price;
  // Anchor SPY on the earliest date where both sides have a value so
  // the lines start aligned visually at 0%.
  let spyBase: number | null = null;
  for (const s of tickerSinceStart) {
    const p = spyByDate.get(s.snapshot_date);
    if (p !== undefined) {
      spyBase = p;
      break;
    }
  }

  return tickerSinceStart.map((s) => {
    const spyHere = spyByDate.get(s.snapshot_date);
    return {
      t: s.snapshot_date,
      ticker_pct:
        firstTickerPrice > 0
          ? ((s.close_price - firstTickerPrice) / firstTickerPrice) * 100
          : null,
      spy_pct:
        spyBase === null || spyHere === undefined || spyBase === 0
          ? null
          : ((spyHere - spyBase) / spyBase) * 100,
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

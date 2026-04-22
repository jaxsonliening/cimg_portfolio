import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { latestPricesFor } from "@/lib/queries/latest-prices";
import {
  allocateTradesFifo,
  averageCostBasis,
  type AllocatedLot,
} from "@/lib/calc/lots";

export type EnrichedLot = AllocatedLot & {
  committee_id: string;
  name: string;
};

/**
 * One row per ticker. Aggregates all lots (FIFO-allocated against trades)
 * and derives weighted cost basis, current market value, unrealized P&L,
 * realized P&L, and portfolio weight.
 */
export type TickerPosition = {
  ticker: string;
  name: string;
  committee: { id: string; name: string } | null;
  shares_remaining: number;
  avg_cost_basis: number | null;
  current_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pct: number | null;
  realized_pnl: number;
  weight: number | null;
  lots: EnrichedLot[];
};

export async function getPositions(
  supabase: SupabaseClient<Database>,
  { includeClosed = false }: { includeClosed?: boolean } = {},
): Promise<TickerPosition[]> {
  const [lotsRes, tradesRes, committeesRes] = await Promise.all([
    supabase
      .from("positions")
      .select(
        "id, ticker, name, committee_id, shares, cost_basis, purchased_at",
      ),
    supabase
      .from("trades")
      .select("ticker, shares, price, traded_at"),
    supabase.from("committees").select("id, name"),
  ]);
  if (lotsRes.error) throw lotsRes.error;
  if (tradesRes.error) throw tradesRes.error;
  if (committeesRes.error) throw committeesRes.error;

  const committeesById = new Map(committeesRes.data.map((c) => [c.id, c]));
  const tickers = Array.from(new Set(lotsRes.data.map((l) => l.ticker)));
  const prices = await latestPricesFor(supabase, tickers);

  // Group lots + trades by ticker.
  const lotsByTicker = new Map<string, typeof lotsRes.data>();
  for (const lot of lotsRes.data) {
    const arr = lotsByTicker.get(lot.ticker) ?? [];
    arr.push(lot);
    lotsByTicker.set(lot.ticker, arr);
  }
  const tradesByTicker = new Map<string, typeof tradesRes.data>();
  for (const trade of tradesRes.data) {
    const arr = tradesByTicker.get(trade.ticker) ?? [];
    arr.push(trade);
    tradesByTicker.set(trade.ticker, arr);
  }

  // First pass: compute per-ticker aggregates so we know the total market
  // value denominator for weight.
  type Row = TickerPosition & { _open: boolean };
  const rows: Row[] = [];

  for (const ticker of tickers) {
    const lots = lotsByTicker.get(ticker) ?? [];
    const trades = tradesByTicker.get(ticker) ?? [];
    const allocated = allocateTradesFifo(lots, trades);
    const enrichedLots: EnrichedLot[] = allocated.map((a) => {
      const source = lots.find((l) => l.id === a.id)!;
      return {
        ...a,
        committee_id: source.committee_id,
        name: source.name,
      };
    });

    const sharesRemaining = enrichedLots.reduce(
      (sum, l) => sum + l.remaining_shares,
      0,
    );
    const realizedPnl = enrichedLots.reduce(
      (sum, l) => sum + l.realized_pnl,
      0,
    );

    const avgCost = averageCostBasis(allocated);
    const currentPrice = prices.get(ticker) ?? null;
    const marketValue =
      currentPrice === null || sharesRemaining === 0
        ? null
        : round2(sharesRemaining * currentPrice);
    const unrealizedPnl =
      currentPrice === null || avgCost === null || sharesRemaining === 0
        ? null
        : round2((currentPrice - avgCost) * sharesRemaining);
    const unrealizedPct =
      unrealizedPnl === null || avgCost === null || avgCost === 0
        ? null
        : (currentPrice! - avgCost) / avgCost;

    // Use the earliest lot's committee + name as canonical for the ticker.
    // All lots of the same ticker ~should~ be in the same committee; if not,
    // admin UI can still surface the mismatch per-lot.
    const primary = enrichedLots[0];
    const committee = primary
      ? committeesById.get(primary.committee_id) ?? null
      : null;

    rows.push({
      _open: sharesRemaining > 0,
      ticker,
      name: primary?.name ?? ticker,
      committee: committee ? { id: committee.id, name: committee.name } : null,
      shares_remaining: round4(sharesRemaining),
      avg_cost_basis: avgCost,
      current_price: currentPrice,
      market_value: marketValue,
      unrealized_pnl: unrealizedPnl,
      unrealized_pct: unrealizedPct,
      realized_pnl: round2(realizedPnl),
      weight: null, // filled in below
      lots: enrichedLots,
    });
  }

  const openMarketValue = rows.reduce(
    (sum, r) => sum + (r._open && r.market_value !== null ? r.market_value : 0),
    0,
  );

  return rows
    .filter((r) => includeClosed || r._open)
    .map(({ _open, ...rest }) => ({
      ...rest,
      weight:
        _open && rest.market_value !== null && openMarketValue > 0
          ? rest.market_value / openMarketValue
          : null,
    }))
    .sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

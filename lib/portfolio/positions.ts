import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { latestPricesFor } from "@/lib/queries/latest-prices";

export type EnrichedPosition = {
  id: string;
  ticker: string;
  name: string;
  committee: { id: string; name: string } | null;
  shares: number;
  cost_basis: number;
  purchased_at: string;
  closed_at: string | null;
  close_price: number | null;
  current_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pct: number | null;
  weight: number | null;
};

export async function getPositions(
  supabase: SupabaseClient<Database>,
  { includeClosed = false }: { includeClosed?: boolean } = {},
): Promise<EnrichedPosition[]> {
  const positionsQuery = supabase
    .from("positions")
    .select(
      "id, ticker, name, committee_id, shares, cost_basis, purchased_at, closed_at, close_price",
    );

  const [positionsRes, committeesRes] = await Promise.all([
    includeClosed ? positionsQuery : positionsQuery.is("closed_at", null),
    supabase.from("committees").select("id, name"),
  ]);
  if (positionsRes.error) throw positionsRes.error;
  if (committeesRes.error) throw committeesRes.error;

  const committeesById = new Map(committeesRes.data.map((c) => [c.id, c]));
  const tickers = Array.from(
    new Set(positionsRes.data.map((p) => p.ticker)),
  );
  const prices = await latestPricesFor(supabase, tickers);

  const openMarketValue = positionsRes.data
    .filter((p) => p.closed_at === null)
    .reduce((sum, p) => sum + p.shares * (prices.get(p.ticker) ?? 0), 0);

  return positionsRes.data.map((p) => {
    const currentPrice = prices.get(p.ticker) ?? null;
    const marketValue = currentPrice === null ? null : p.shares * currentPrice;
    const unrealizedPnl =
      currentPrice === null ? null : (currentPrice - p.cost_basis) * p.shares;
    const unrealizedPct =
      currentPrice === null || p.cost_basis === 0
        ? null
        : (currentPrice - p.cost_basis) / p.cost_basis;
    const weight =
      p.closed_at !== null || marketValue === null || openMarketValue === 0
        ? null
        : marketValue / openMarketValue;

    return {
      id: p.id,
      ticker: p.ticker,
      name: p.name,
      committee: committeesById.get(p.committee_id) ?? null,
      shares: p.shares,
      cost_basis: p.cost_basis,
      purchased_at: p.purchased_at,
      closed_at: p.closed_at,
      close_price: p.close_price,
      current_price: currentPrice,
      market_value: marketValue === null ? null : round2(marketValue),
      unrealized_pnl: unrealizedPnl === null ? null : round2(unrealizedPnl),
      unrealized_pct: unrealizedPct,
      weight,
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

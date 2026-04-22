import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { latestPricesFor } from "@/lib/queries/latest-prices";
import {
  computeCommitteeAllocations,
  type CommitteeAllocation,
} from "@/lib/calc/portfolio";
import { allocateTradesFifo } from "@/lib/calc/lots";

export async function getCommitteeAllocations(
  supabase: SupabaseClient<Database>,
): Promise<CommitteeAllocation[]> {
  const [committeesRes, lotsRes, tradesRes] = await Promise.all([
    supabase.from("committees").select("id, name, color, display_order"),
    supabase
      .from("positions")
      .select("id, ticker, shares, cost_basis, purchased_at, committee_id"),
    supabase.from("trades").select("ticker, shares, price, traded_at"),
  ]);
  if (committeesRes.error) throw committeesRes.error;
  if (lotsRes.error) throw lotsRes.error;
  if (tradesRes.error) throw tradesRes.error;

  const tradesByTicker = new Map<string, typeof tradesRes.data>();
  for (const trade of tradesRes.data) {
    const arr = tradesByTicker.get(trade.ticker) ?? [];
    arr.push(trade);
    tradesByTicker.set(trade.ticker, arr);
  }

  // FIFO-allocate per ticker, then emit one "position" per open lot slice
  // so the per-committee sum uses remaining_shares.
  const lotsByTicker = new Map<string, typeof lotsRes.data>();
  for (const lot of lotsRes.data) {
    const arr = lotsByTicker.get(lot.ticker) ?? [];
    arr.push(lot);
    lotsByTicker.set(lot.ticker, arr);
  }

  const openSlices: { ticker: string; committee_id: string; shares: number }[] = [];
  for (const [ticker, lots] of lotsByTicker) {
    const allocated = allocateTradesFifo(
      lots,
      tradesByTicker.get(ticker) ?? [],
    );
    for (const a of allocated) {
      if (a.remaining_shares <= 0) continue;
      const source = lots.find((l) => l.id === a.id)!;
      openSlices.push({
        ticker,
        committee_id: source.committee_id,
        shares: a.remaining_shares,
      });
    }
  }

  const tickers = Array.from(new Set(openSlices.map((s) => s.ticker)));
  const prices = await latestPricesFor(supabase, tickers);

  const { allocations } = computeCommitteeAllocations(
    committeesRes.data,
    openSlices,
    prices,
  );
  return allocations;
}

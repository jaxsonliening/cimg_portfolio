import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { allocateTradesFifo } from "@/lib/calc/lots";

/**
 * Tickers that still have remaining shares after FIFO-allocating trades
 * against buy lots. Used by the cron jobs to know which symbols to quote
 * and by /performance to know which intraday series to build.
 */
export async function getActiveTickers(
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  const [lotsRes, tradesRes] = await Promise.all([
    supabase
      .from("positions")
      .select("id, ticker, shares, cost_basis, purchased_at"),
    supabase.from("trades").select("ticker, shares, price, traded_at"),
  ]);
  if (lotsRes.error) throw lotsRes.error;
  if (tradesRes.error) throw tradesRes.error;

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

  const active: string[] = [];
  for (const [ticker, lots] of lotsByTicker) {
    const allocated = allocateTradesFifo(
      lots,
      tradesByTicker.get(ticker) ?? [],
    );
    const remaining = allocated.reduce((s, a) => s + a.remaining_shares, 0);
    if (remaining > 0) active.push(ticker);
  }
  return active;
}

/**
 * Like getActiveTickers but also returns the remaining-shares map so
 * callers (e.g. the daily cron computing fund value) don't re-run FIFO.
 */
export async function getActiveSharesByTicker(
  supabase: SupabaseClient<Database>,
): Promise<Map<string, number>> {
  const [lotsRes, tradesRes] = await Promise.all([
    supabase
      .from("positions")
      .select("id, ticker, shares, cost_basis, purchased_at"),
    supabase.from("trades").select("ticker, shares, price, traded_at"),
  ]);
  if (lotsRes.error) throw lotsRes.error;
  if (tradesRes.error) throw tradesRes.error;

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

  const shares = new Map<string, number>();
  for (const [ticker, lots] of lotsByTicker) {
    const allocated = allocateTradesFifo(
      lots,
      tradesByTicker.get(ticker) ?? [],
    );
    const remaining = allocated.reduce((s, a) => s + a.remaining_shares, 0);
    if (remaining > 0) shares.set(ticker, remaining);
  }
  return shares;
}

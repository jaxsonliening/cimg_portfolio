import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Resolve the most recent known price for each ticker.
 * Preference order: intraday tick in the last 3 days → daily close snapshot.
 * Missing tickers simply don't appear in the returned Map.
 */
export async function latestPricesFor(
  supabase: SupabaseClient<Database>,
  tickers: string[],
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (tickers.length === 0) return prices;

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: ticks, error: ticksError } = await supabase
    .from("price_ticks")
    .select("ticker, price, observed_at")
    .in("ticker", tickers)
    .gte("observed_at", threeDaysAgo)
    .order("observed_at", { ascending: false });
  if (ticksError) throw ticksError;

  for (const t of ticks ?? []) {
    if (!prices.has(t.ticker)) prices.set(t.ticker, t.price);
  }

  const missing = tickers.filter((t) => !prices.has(t));
  if (missing.length === 0) return prices;

  const { data: snapshots, error: snapshotsError } = await supabase
    .from("price_snapshots")
    .select("ticker, close_price, snapshot_date")
    .in("ticker", missing)
    .order("snapshot_date", { ascending: false });
  if (snapshotsError) throw snapshotsError;

  for (const s of snapshots ?? []) {
    if (!prices.has(s.ticker)) prices.set(s.ticker, s.close_price);
  }

  return prices;
}

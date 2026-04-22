import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { latestPricesFor } from "@/lib/queries/latest-prices";

export type PortfolioSummary = {
  as_of: string;
  total_value: number;
  cash: number;
  daily_pnl: number | null;
  daily_pct: number | null;
  ytd_pnl: number | null;
  ytd_pct: number | null;
  inception_pnl: number | null;
  inception_pct: number | null;
};

export async function getPortfolioSummary(
  supabase: SupabaseClient<Database>,
): Promise<PortfolioSummary> {
  const { data: positions, error } = await supabase
    .from("positions")
    .select("ticker, shares")
    .is("closed_at", null);
  if (error) throw error;

  const tickers = Array.from(new Set(positions.map((p) => p.ticker)));
  const prices = await latestPricesFor(supabase, tickers);

  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${new Date().getUTCFullYear()}-01-01`;

  const [latestFund, previousFund, ytdFund, inceptionFund] = await Promise.all([
    supabase
      .from("fund_snapshots")
      .select("snapshot_date, cash")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("fund_snapshots")
      .select("total_value")
      .lt("snapshot_date", today)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("fund_snapshots")
      .select("total_value")
      .gte("snapshot_date", yearStart)
      .order("snapshot_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("fund_snapshots")
      .select("total_value")
      .order("snapshot_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const cash = latestFund.data?.cash ?? 0;
  const openMarketValue = positions.reduce(
    (sum, p) => sum + p.shares * (prices.get(p.ticker) ?? 0),
    0,
  );
  const totalValue = openMarketValue + cash;

  return {
    as_of: latestFund.data?.snapshot_date ?? today,
    total_value: round2(totalValue),
    cash: round2(cash),
    ...delta(totalValue, previousFund.data?.total_value, "daily"),
    ...delta(totalValue, ytdFund.data?.total_value, "ytd"),
    ...delta(totalValue, inceptionFund.data?.total_value, "inception"),
  };
}

function delta(
  current: number,
  baseline: number | undefined,
  prefix: "daily" | "ytd" | "inception",
): Record<`${typeof prefix}_pnl` | `${typeof prefix}_pct`, number | null> {
  if (baseline === undefined) {
    return {
      [`${prefix}_pnl`]: null,
      [`${prefix}_pct`]: null,
    } as ReturnType<typeof delta>;
  }
  const pnl = current - baseline;
  const pct = baseline > 0 ? pnl / baseline : null;
  return {
    [`${prefix}_pnl`]: round2(pnl),
    [`${prefix}_pct`]: pct,
  } as ReturnType<typeof delta>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

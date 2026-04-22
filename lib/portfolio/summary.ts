import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { latestPricesFor } from "@/lib/queries/latest-prices";
import { allocateTradesFifo } from "@/lib/calc/lots";

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
  dividend_income_ytd: number;
  dividend_income_total: number;
};

export async function getPortfolioSummary(
  supabase: SupabaseClient<Database>,
): Promise<PortfolioSummary> {
  const [lotsRes, tradesRes, cashRes] = await Promise.all([
    supabase
      .from("positions")
      .select("id, ticker, shares, cost_basis, purchased_at"),
    supabase.from("trades").select("ticker, shares, price, traded_at"),
    supabase
      .from("cash_transactions")
      .select("amount, kind, occurred_at"),
  ]);
  if (lotsRes.error) throw lotsRes.error;
  if (tradesRes.error) throw tradesRes.error;
  if (cashRes.error) throw cashRes.error;

  // Shares remaining per ticker via FIFO.
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

  const sharesByTicker = new Map<string, number>();
  for (const [ticker, lots] of lotsByTicker) {
    const allocated = allocateTradesFifo(lots, tradesByTicker.get(ticker) ?? []);
    const remaining = allocated.reduce((sum, a) => sum + a.remaining_shares, 0);
    if (remaining > 0) sharesByTicker.set(ticker, remaining);
  }

  const tickers = Array.from(sharesByTicker.keys());
  const prices = await latestPricesFor(supabase, tickers);

  const openMarketValue = Array.from(sharesByTicker.entries()).reduce(
    (sum, [ticker, shares]) => sum + shares * (prices.get(ticker) ?? 0),
    0,
  );

  const cash = cashRes.data.reduce((sum, row) => sum + row.amount, 0);
  const totalValue = openMarketValue + cash;

  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${new Date().getUTCFullYear()}-01-01`;

  const dividendIncomeTotal = cashRes.data
    .filter((r) => r.kind === "dividend")
    .reduce((sum, r) => sum + r.amount, 0);
  const dividendIncomeYtd = cashRes.data
    .filter((r) => r.kind === "dividend" && r.occurred_at >= yearStart)
    .reduce((sum, r) => sum + r.amount, 0);

  const [latestFundRes, previousFundRes, ytdFundRes, inceptionFundRes] =
    await Promise.all([
      supabase
        .from("fund_snapshots")
        .select("snapshot_date")
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

  return {
    as_of: latestFundRes.data?.snapshot_date ?? today,
    total_value: round2(totalValue),
    cash: round2(cash),
    ...delta(totalValue, previousFundRes.data?.total_value, "daily"),
    ...delta(totalValue, ytdFundRes.data?.total_value, "ytd"),
    ...delta(totalValue, inceptionFundRes.data?.total_value, "inception"),
    dividend_income_ytd: round2(dividendIncomeYtd),
    dividend_income_total: round2(dividendIncomeTotal),
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

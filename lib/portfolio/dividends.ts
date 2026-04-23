import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Dividend income summary for the public dashboard. Cash dividends
// are recorded in `cash_transactions` with kind='dividend' and a
// non-null ticker; this module aggregates them three ways (YTD,
// trailing 12 months, all-time) and per-ticker for display.

export type DividendSummary = {
  ytd_total: number;
  twelve_month_total: number;
  all_time_total: number;
  by_ticker: Array<{
    ticker: string;
    name: string;
    committee: { id: string; name: string; color: string | null } | null;
    ytd_amount: number;
    twelve_month_amount: number;
    latest_payment: string | null;
  }>;
};

export async function getDividendSummary(
  supabase: SupabaseClient<Database>,
): Promise<DividendSummary> {
  const [dividendsRes, positionsRes, committeesRes] = await Promise.all([
    supabase
      .from("cash_transactions")
      .select("amount, ticker, occurred_at")
      .eq("kind", "dividend"),
    supabase
      .from("positions")
      .select("ticker, name, committee_id, purchased_at"),
    supabase.from("committees").select("id, name, color"),
  ]);
  if (dividendsRes.error) throw dividendsRes.error;
  if (positionsRes.error) throw positionsRes.error;
  if (committeesRes.error) throw committeesRes.error;

  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const ytdBoundary = `${year}-01-01`;
  const twelveMonthBoundary = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Earliest-purchased lot wins the "display" committee + name for a ticker,
  // matching the convention in getPositions. This keeps the panel consistent
  // with the main positions table when a ticker has been held by multiple
  // committees over time.
  const committeesById = new Map(committeesRes.data.map((c) => [c.id, c]));
  const metaByTicker = new Map<
    string,
    { name: string; committee_id: string; purchased_at: string }
  >();
  for (const p of positionsRes.data) {
    const existing = metaByTicker.get(p.ticker);
    if (!existing || p.purchased_at < existing.purchased_at) {
      metaByTicker.set(p.ticker, {
        name: p.name,
        committee_id: p.committee_id,
        purchased_at: p.purchased_at,
      });
    }
  }

  type Agg = {
    ticker: string;
    ytd_amount: number;
    twelve_month_amount: number;
    all_time: number;
    latest_payment: string | null;
  };
  const byTicker = new Map<string, Agg>();

  let ytdTotal = 0;
  let twelveMonthTotal = 0;
  let allTimeTotal = 0;

  for (const row of dividendsRes.data) {
    if (row.ticker === null) continue;
    const amount = row.amount;
    const occurred = row.occurred_at;

    allTimeTotal += amount;
    const inYtd = occurred >= ytdBoundary;
    const inTrailing = occurred >= twelveMonthBoundary;
    if (inYtd) ytdTotal += amount;
    if (inTrailing) twelveMonthTotal += amount;

    const current = byTicker.get(row.ticker) ?? {
      ticker: row.ticker,
      ytd_amount: 0,
      twelve_month_amount: 0,
      all_time: 0,
      latest_payment: null as string | null,
    };
    current.all_time += amount;
    if (inYtd) current.ytd_amount += amount;
    if (inTrailing) current.twelve_month_amount += amount;
    if (current.latest_payment === null || occurred > current.latest_payment) {
      current.latest_payment = occurred;
    }
    byTicker.set(row.ticker, current);
  }

  const rows = Array.from(byTicker.values())
    .map((agg) => {
      const meta = metaByTicker.get(agg.ticker);
      const committee = meta
        ? committeesById.get(meta.committee_id) ?? null
        : null;
      return {
        ticker: agg.ticker,
        name: meta?.name ?? agg.ticker,
        committee: committee
          ? {
              id: committee.id,
              name: committee.name,
              color: committee.color ?? null,
            }
          : null,
        ytd_amount: agg.ytd_amount,
        twelve_month_amount: agg.twelve_month_amount,
        latest_payment: agg.latest_payment,
      };
    })
    .sort((a, b) => {
      if (b.ytd_amount !== a.ytd_amount) return b.ytd_amount - a.ytd_amount;
      return b.twelve_month_amount - a.twelve_month_amount;
    });

  return {
    ytd_total: ytdTotal,
    twelve_month_total: twelveMonthTotal,
    all_time_total: allTimeTotal,
    by_ticker: rows,
  };
}

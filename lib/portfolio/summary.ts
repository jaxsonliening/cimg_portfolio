import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { PortfolioSummary } from "@/lib/portfolio/types";
import { latestPricesFor } from "@/lib/queries/latest-prices";
import { allocateTradesFifo } from "@/lib/calc/lots";
import { computeRiskMetrics } from "@/lib/calc/risk";

const BENCHMARK = "SPY";

export async function getSummary(
  supabase: SupabaseClient<Database>,
): Promise<PortfolioSummary> {
  const [
    lotsRes,
    tradesRes,
    cashRes,
    metaRes,
    fundRes,
    benchmarkRes,
    latestTickRes,
    latestSnapshotRes,
  ] = await Promise.all([
    supabase
      .from("positions")
      .select("id, ticker, shares, cost_basis, purchased_at"),
    supabase.from("trades").select("ticker, shares, price, traded_at"),
    supabase
      .from("cash_transactions")
      .select("amount, kind, occurred_at"),
    supabase
      .from("ticker_meta")
      .select("ticker, intrinsic_value, value_updated_at"),
    supabase
      .from("fund_snapshots")
      .select("snapshot_date, total_value")
      .order("snapshot_date", { ascending: true })
      .range(0, 49999),
    supabase
      .from("benchmark_snapshots")
      .select("observed_at, price, close_date")
      .eq("symbol", BENCHMARK)
      .eq("is_daily_close", true)
      .order("observed_at", { ascending: true })
      .range(0, 49999),
    supabase
      .from("price_ticks")
      .select("observed_at")
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("price_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (lotsRes.error) throw lotsRes.error;
  if (tradesRes.error) throw tradesRes.error;
  if (cashRes.error) throw cashRes.error;
  if (metaRes.error) throw metaRes.error;
  if (fundRes.error) throw fundRes.error;
  if (benchmarkRes.error) throw benchmarkRes.error;

  const lotsByTicker = groupBy(lotsRes.data, (l) => l.ticker);
  const tradesByTicker = groupBy(tradesRes.data, (t) => t.ticker);

  const sharesByTicker = new Map<string, number>();
  for (const [ticker, lots] of lotsByTicker) {
    const allocated = allocateTradesFifo(lots, tradesByTicker.get(ticker) ?? []);
    const remaining = allocated.reduce((s, a) => s + a.remaining_shares, 0);
    if (remaining > 0) sharesByTicker.set(ticker, remaining);
  }

  const heldTickers = Array.from(sharesByTicker.keys());
  const prices = await latestPricesFor(supabase, heldTickers);

  const marketValueEquities = heldTickers.reduce((sum, t) => {
    const price = prices.get(t);
    const shares = sharesByTicker.get(t) ?? 0;
    return price === undefined ? sum : sum + shares * price;
  }, 0);

  const cashBalance = cashRes.data.reduce((s, r) => s + r.amount, 0);
  const marketValuePortfolio = marketValueEquities + cashBalance;

  const intrinsicByTicker = new Map<string, number | null>();
  for (const m of metaRes.data) intrinsicByTicker.set(m.ticker, m.intrinsic_value);

  let intrinsicSum = 0;
  let missingIntrinsic = false;
  for (const ticker of heldTickers) {
    const iv = intrinsicByTicker.get(ticker);
    if (iv === undefined || iv === null) {
      missingIntrinsic = true;
      continue;
    }
    intrinsicSum += (sharesByTicker.get(ticker) ?? 0) * iv;
  }
  const intrinsicValuePortfolio = intrinsicSum + cashBalance;
  const equityVpExCash =
    missingIntrinsic || marketValueEquities === 0
      ? null
      : intrinsicSum / marketValueEquities;

  const capitalInjectionDate =
    cashRes.data
      .filter((r) => r.kind === "capital_injection")
      .map((r) => r.occurred_at)
      .sort()
      .pop() ?? null;

  let lastUpdateTradingDay: string | null = null;
  for (const m of metaRes.data) {
    if (m.value_updated_at === null) continue;
    const date = m.value_updated_at.slice(0, 10);
    if (lastUpdateTradingDay === null || date > lastUpdateTradingDay) {
      lastUpdateTradingDay = date;
    }
  }

  const fundSeries = fundRes.data.map((f) => ({
    date: f.snapshot_date,
    value: f.total_value,
  }));
  const spyDailySeries = benchmarkRes.data.map((b) => ({
    date: b.close_date ?? b.observed_at.slice(0, 10),
    value: b.price,
  }));

  const cimgPreCapital = pctChangePreInjection(fundSeries, capitalInjectionDate);
  const cimgPostCapital = pctChangePostInjection(fundSeries, capitalInjectionDate);
  const spyPreCapital = pctChangePreInjection(spyDailySeries, capitalInjectionDate);
  const spyPostCapital = pctChangePostInjection(spyDailySeries, capitalInjectionDate);

  const currentYear = new Date().getUTCFullYear();
  const yearStart = `${currentYear}-01-01`;
  const cimgYtd = pctChangeYtd(fundSeries, yearStart);
  const spyYtd = pctChangeYtd(spyDailySeries, yearStart);

  const latestFund = fundSeries[fundSeries.length - 1];
  const previousFundBeforeLatest = latestFund
    ? [...fundSeries].filter((f) => f.date < latestFund.date).pop()
    : undefined;
  const cimgDayChange =
    previousFundBeforeLatest && previousFundBeforeLatest.value > 0
      ? (marketValuePortfolio - previousFundBeforeLatest.value) /
        previousFundBeforeLatest.value
      : null;

  const spyDayChange =
    spyDailySeries.length >= 2
      ? (() => {
          const last = spyDailySeries[spyDailySeries.length - 1];
          const prev = spyDailySeries[spyDailySeries.length - 2];
          return prev.value > 0 ? (last.value - prev.value) / prev.value : null;
        })()
      : null;

  // as_of = the most recent day we have price data for (ticks or daily
  // close snapshots). Deliberately excludes ticker_meta and fund_snapshots
  // so the header reflects "prices are current as of" cleanly; PM-driven
  // portfolio metadata has its own field (last_update_trading_day).
  const asOfCandidates: string[] = [];
  if (latestTickRes.data?.observed_at) {
    asOfCandidates.push(latestTickRes.data.observed_at.slice(0, 10));
  }
  if (latestSnapshotRes.data?.snapshot_date) {
    asOfCandidates.push(latestSnapshotRes.data.snapshot_date);
  }
  if (spyDailySeries.length > 0) {
    asOfCandidates.push(spyDailySeries[spyDailySeries.length - 1].date);
  }
  const asOf = asOfCandidates.length
    ? asOfCandidates.sort().pop()!
    : new Date().toISOString().slice(0, 10);

  const cashPositionPct =
    marketValuePortfolio > 0 ? cashBalance / marketValuePortfolio : 0;

  // Risk metrics over the post-capital-injection window. Aligns fund
  // and SPY by date so we only use days where both series have a
  // value — otherwise the beta regression would see mismatched
  // returns. Pre-injection data is excluded so the one-time step
  // doesn't poison the volatility/drawdown figures.
  const postInjectionDate = capitalInjectionDate ?? "";
  const alignedValues = alignByDate(
    fundSeries.filter((f) => !postInjectionDate || f.date >= postInjectionDate),
    spyDailySeries.filter((s) => !postInjectionDate || s.date >= postInjectionDate),
  );
  const risk = computeRiskMetrics(
    alignedValues.map((v) => v.fund),
    alignedValues.map((v) => v.bench),
  );

  return {
    market_value_equities: marketValueEquities,
    cash_balance: cashBalance,
    cash_position_pct: cashPositionPct,
    market_value_portfolio: marketValuePortfolio,
    intrinsic_value_portfolio: intrinsicValuePortfolio,
    equity_vp_ex_cash: equityVpExCash,

    cimg_pre_capital_injection_pct: cimgPreCapital,
    spy_pre_capital_injection_pct: spyPreCapital,
    cimg_post_capital_injection_pct: cimgPostCapital,
    spy_post_capital_injection_pct: spyPostCapital,
    cimg_ytd_pct: cimgYtd,
    spy_ytd_pct: spyYtd,
    cimg_day_change_pct: cimgDayChange,
    spy_day_change_pct: spyDayChange,

    last_update_trading_day: lastUpdateTradingDay,
    capital_injection_date: capitalInjectionDate,
    as_of: asOf,

    beta: risk.beta,
    volatility: risk.volatility,
    sharpe: risk.sharpe,
    max_drawdown: risk.max_drawdown,
  };
}

// Inner-join two dated series by date. Used so beta / correlation
// computations only see days where both sides have a value.
function alignByDate(
  fund: DatedValue[],
  bench: DatedValue[],
): { fund: number; bench: number }[] {
  const byDate = new Map<string, number>();
  for (const f of fund) byDate.set(f.date, f.value);
  const out: { fund: number; bench: number }[] = [];
  for (const b of bench) {
    const f = byDate.get(b.date);
    if (f !== undefined) out.push({ fund: f, bench: b.value });
  }
  return out;
}

type DatedValue = { date: string; value: number };

function pctChangePreInjection(
  series: DatedValue[],
  injectionDate: string | null,
): number | null {
  if (!injectionDate || series.length < 2) return null;
  const first = series[0];
  const lastBefore = [...series].filter((s) => s.date < injectionDate).pop();
  if (!lastBefore || first.value <= 0 || first.date === lastBefore.date) {
    return null;
  }
  return (lastBefore.value - first.value) / first.value;
}

function pctChangePostInjection(
  series: DatedValue[],
  injectionDate: string | null,
): number | null {
  if (!injectionDate || series.length === 0) return null;
  const firstOnOrAfter = series.find((s) => s.date >= injectionDate);
  const last = series[series.length - 1];
  if (!firstOnOrAfter || firstOnOrAfter.date === last.date) return null;
  if (firstOnOrAfter.value <= 0) return null;
  return (last.value - firstOnOrAfter.value) / firstOnOrAfter.value;
}

function pctChangeYtd(
  series: DatedValue[],
  yearStart: string,
): number | null {
  const ytd = series.filter((s) => s.date >= yearStart);
  if (ytd.length < 2) return null;
  const first = ytd[0];
  const last = ytd[ytd.length - 1];
  if (first.value <= 0 || first.date === last.date) return null;
  return (last.value - first.value) / first.value;
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

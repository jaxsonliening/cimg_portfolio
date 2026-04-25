import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { PositionRow } from "@/lib/portfolio/types";
import { latestPricesFor } from "@/lib/queries/latest-prices";
import { paginateSelect } from "@/lib/queries/paginate";
import { fetchQuotes, fetchProfiles, type FmpQuote, type FmpProfile } from "@/lib/market/fmp";
import {
  allocateTradesFifo,
  averageCostBasis,
  type AllocatedLot,
} from "@/lib/calc/lots";

export async function getPositions(
  supabase: SupabaseClient<Database>,
): Promise<PositionRow[]> {
  const today = new Date().toISOString().slice(0, 10);

  // Bound the snapshots query so one fetch covers the 30-day, since-last-update,
  // and day-change lookups for every held ticker.
  const earliestNeeded = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [lotsRes, tradesRes, committeesRes, metaRes] = await Promise.all([
    supabase
      .from("positions")
      .select(
        "id, ticker, name, committee_id, shares, cost_basis, purchased_at",
      ),
    supabase.from("trades").select("ticker, shares, price, traded_at"),
    supabase.from("committees").select("id, name, color"),
    supabase
      .from("ticker_meta")
      .select("ticker, target_weight, intrinsic_value, value_updated_at"),
  ]);
  if (lotsRes.error) throw lotsRes.error;
  if (tradesRes.error) throw tradesRes.error;
  if (committeesRes.error) throw committeesRes.error;
  if (metaRes.error) throw metaRes.error;

  const committeesById = new Map(committeesRes.data.map((c) => [c.id, c]));
  const metaByTicker = new Map(metaRes.data.map((m) => [m.ticker, m]));

  const tickers = Array.from(new Set(lotsRes.data.map((l) => l.ticker)));
  if (tickers.length === 0) return [];

  // Live Yahoo quotes for current price + fundamentals + day change.
  // Falls back to the snapshot-based latestPricesFor if Yahoo is
  // unreachable (network hiccup, rate limit) so the dashboard still
  // renders something reasonable. fetchProfiles is best-effort too.
  let liveQuotes: FmpQuote[] = [];
  let liveProfiles: FmpProfile[] = [];
  try {
    [liveQuotes, liveProfiles] = await Promise.all([
      fetchQuotes(tickers),
      fetchProfiles(tickers),
    ]);
  } catch {
    // Swallow — the snapshot fallback below keeps the page rendering.
  }
  const liveByTicker = new Map(liveQuotes.map((q) => [q.symbol, q]));
  const profileByTicker = new Map(liveProfiles.map((p) => [p.symbol, p]));

  // 26 tickers × ~400 dates = ~10k rows. Supabase caps raw queries
  // at 1000; paginate through so we actually get every row. Without
  // this, we'd silently return only the OLDEST ~1000 after ORDER BY
  // ASC, and the week / month / since-last-update lookups would all
  // pick the same far-in-the-past snapshot and return identical
  // (wrong) numbers across the three columns.
  const [snapshotPrices, snapshotsRows] = await Promise.all([
    latestPricesFor(supabase, tickers),
    paginateSelect<{
      ticker: string;
      snapshot_date: string;
      close_price: number;
      market_cap: number | null;
      enterprise_value: number | null;
      pe_ratio: number | null;
      forward_pe: number | null;
      eps: number | null;
      dividend_yield: number | null;
      price_to_book: number | null;
      ev_to_ebitda: number | null;
      roe: number | null;
      beta: number | null;
      sector: string | null;
      industry: string | null;
    }>(() =>
      supabase
        .from("price_snapshots")
        .select(
          "ticker, snapshot_date, close_price, market_cap, enterprise_value, pe_ratio, forward_pe, eps, dividend_yield, price_to_book, ev_to_ebitda, roe, beta, sector, industry",
        )
        .in("ticker", tickers)
        .gte("snapshot_date", earliestNeeded)
        // Both keys needed for stable pagination — snapshot_date alone
        // has ~26 ties per date, and PostgreSQL is free to return
        // ties in a different order across .range() calls, which
        // duplicates some rows and silently drops others when a page
        // boundary falls inside a date.
        .order("snapshot_date", { ascending: true })
        .order("ticker", { ascending: true }),
    ),
  ]);

  // Compose the final current-price lookup: live Yahoo wins, snapshot
  // fallback if Yahoo didn't return a value for a ticker.
  const prices = new Map<string, number>();
  for (const t of tickers) {
    const live = liveByTicker.get(t)?.price;
    const snap = snapshotPrices.get(t);
    if (typeof live === "number") prices.set(t, live);
    else if (typeof snap === "number") prices.set(t, snap);
  }

  const snapshotsByTicker = groupBy(snapshotsRows, (s) => s.ticker);

  // Latest fundamentals per ticker: walk each ticker's ordered snapshots
  // backwards, pick the first row with non-null values for each field.
  // Different fields can come from different snapshot_dates that way,
  // since FMP sometimes omits a single metric on a given day.
  type Fundamentals = {
    market_cap: number | null;
    enterprise_value: number | null;
    pe_ratio: number | null;
    forward_pe: number | null;
    eps: number | null;
    dividend_yield: number | null;
    price_to_book: number | null;
    ev_to_ebitda: number | null;
    roe: number | null;
    beta: number | null;
    sector: string | null;
    industry: string | null;
  };
  const fundamentalsByTicker = new Map<string, Fundamentals>();
  for (const [ticker, rows] of snapshotsByTicker) {
    const f: Fundamentals = {
      market_cap: null,
      enterprise_value: null,
      pe_ratio: null,
      forward_pe: null,
      eps: null,
      dividend_yield: null,
      price_to_book: null,
      ev_to_ebitda: null,
      roe: null,
      beta: null,
      sector: null,
      industry: null,
    };
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (f.market_cap === null && r.market_cap !== null) f.market_cap = r.market_cap;
      if (f.enterprise_value === null && r.enterprise_value !== null) f.enterprise_value = r.enterprise_value;
      if (f.pe_ratio === null && r.pe_ratio !== null) f.pe_ratio = r.pe_ratio;
      if (f.forward_pe === null && r.forward_pe !== null) f.forward_pe = r.forward_pe;
      if (f.eps === null && r.eps !== null) f.eps = r.eps;
      if (f.dividend_yield === null && r.dividend_yield !== null) f.dividend_yield = r.dividend_yield;
      if (f.price_to_book === null && r.price_to_book !== null) f.price_to_book = r.price_to_book;
      if (f.ev_to_ebitda === null && r.ev_to_ebitda !== null) f.ev_to_ebitda = r.ev_to_ebitda;
      if (f.roe === null && r.roe !== null) f.roe = r.roe;
      if (f.beta === null && r.beta !== null) f.beta = r.beta;
      if (f.sector === null && r.sector !== null) f.sector = r.sector;
      if (f.industry === null && r.industry !== null) f.industry = r.industry;
      if (
        f.market_cap !== null && f.enterprise_value !== null && f.pe_ratio !== null &&
        f.forward_pe !== null && f.eps !== null && f.dividend_yield !== null &&
        f.price_to_book !== null && f.ev_to_ebitda !== null && f.roe !== null &&
        f.beta !== null && f.sector !== null && f.industry !== null
      ) break;
    }
    fundamentalsByTicker.set(ticker, f);
  }

  const lotsByTicker = groupBy(lotsRes.data, (l) => l.ticker);
  const tradesByTicker = groupBy(tradesRes.data, (t) => t.ticker);

  type EnrichedLot = AllocatedLot & { committee_id: string; name: string };
  type Draft = Omit<PositionRow, "current_weight"> & { _current_size: number };

  const drafts: Draft[] = [];

  for (const ticker of tickers) {
    const lots = lotsByTicker.get(ticker) ?? [];
    const trades = tradesByTicker.get(ticker) ?? [];
    const allocated = allocateTradesFifo(lots, trades);
    const enriched: EnrichedLot[] = allocated.map((a) => {
      const source = lots.find((l) => l.id === a.id)!;
      return { ...a, committee_id: source.committee_id, name: source.name };
    });

    const sharesRemaining = enriched.reduce(
      (s, l) => s + l.remaining_shares,
      0,
    );
    if (sharesRemaining === 0) continue;

    const avgCost = averageCostBasis(allocated);
    const currentPrice = prices.get(ticker) ?? null;
    const currentSize =
      currentPrice === null ? 0 : sharesRemaining * currentPrice;
    const unrealizedPnl =
      currentPrice === null || avgCost === null
        ? null
        : sharesRemaining * (currentPrice - avgCost);
    const totalReturn =
      currentPrice === null || avgCost === null || avgCost === 0
        ? null
        : (currentPrice - avgCost) / avgCost;

    const initialPurchase = [...lots]
      .map((l) => l.purchased_at)
      .sort()
      .shift()!;

    const yearsHeld = yearsBetween(initialPurchase, today);
    const heldLessThanOneYear = yearsHeld < 1;
    const annualizedReturn =
      heldLessThanOneYear || totalReturn === null || yearsHeld <= 0
        ? null
        : Math.pow(1 + totalReturn, 1 / yearsHeld) - 1;

    const snapshots = snapshotsByTicker.get(ticker) ?? [];
    const live = liveByTicker.get(ticker) ?? null;

    // Day change — prefer Yahoo's regularMarketChangePercent which is
    // authoritative (current price vs prior close as Yahoo computes
    // it) and doesn't depend on whether price_snapshots has yesterday.
    // Fall back to snapshot-based computation if Yahoo didn't return
    // a value.
    const dayChange =
      live?.dayChangePct ??
      computeDayChangePct(currentPrice, snapshots, today);
    const weekChange = computeWindowChangePct(
      currentPrice,
      snapshots,
      daysAgoIso(today, 7),
    );
    const monthChange = computeWindowChangePct(
      currentPrice,
      snapshots,
      daysAgoIso(today, 30),
    );

    const meta = metaByTicker.get(ticker);
    const sinceLastUpdate =
      meta?.value_updated_at != null
        ? computeSinceLastUpdatePct(
            currentPrice,
            snapshots,
            meta.value_updated_at.slice(0, 10),
          )
        : null;

    const intrinsicValue = meta?.intrinsic_value ?? null;
    const vOverP =
      intrinsicValue === null || currentPrice === null || currentPrice === 0
        ? null
        : intrinsicValue / currentPrice;

    const committeeRow = committeesById.get(
      enriched[0]?.committee_id ?? lots[0].committee_id,
    );

    // Fundamentals: prefer live Yahoo values, fall back to whatever
    // the daily snapshot cron has written. The backfill-prices script
    // only populates price so without live fallback most tickers
    // would show "—" for market cap / P/E / EPS.
    const snapFund = fundamentalsByTicker.get(ticker) ?? {
      market_cap: null,
      enterprise_value: null,
      pe_ratio: null,
      forward_pe: null,
      eps: null,
      dividend_yield: null,
      price_to_book: null,
      ev_to_ebitda: null,
      roe: null,
      beta: null,
      sector: null,
      industry: null,
    };
    const liveProfile = profileByTicker.get(ticker);
    const f = {
      market_cap: live?.marketCap ?? snapFund.market_cap,
      enterprise_value: liveProfile?.enterpriseValue ?? snapFund.enterprise_value,
      pe_ratio: live?.pe ?? snapFund.pe_ratio,
      forward_pe: live?.forwardPe ?? snapFund.forward_pe,
      eps: live?.eps ?? snapFund.eps,
      dividend_yield: live?.dividendYield ?? snapFund.dividend_yield,
      price_to_book: liveProfile?.priceToBook ?? snapFund.price_to_book,
      ev_to_ebitda: liveProfile?.evToEbitda ?? snapFund.ev_to_ebitda,
      roe: liveProfile?.roe ?? snapFund.roe,
      beta: liveProfile?.beta ?? snapFund.beta,
      sector: liveProfile?.sector ?? snapFund.sector,
      industry: liveProfile?.industry ?? snapFund.industry,
    };

    drafts.push({
      ticker,
      name: enriched[0]?.name ?? lots[0].name,
      committee: committeeRow
        ? { id: committeeRow.id, name: committeeRow.name, color: committeeRow.color ?? null }
        : null,

      day_change_pct: dayChange,
      week_change_pct: weekChange,
      month_change_pct: monthChange,
      since_last_update_pct: sinceLastUpdate,

      total_return_pct: totalReturn,
      annualized_return_pct: annualizedReturn,
      held_less_than_one_year: heldLessThanOneYear,

      current_price: currentPrice,
      avg_cost: avgCost,

      target_weight: meta?.target_weight ?? null,

      intrinsic_value: intrinsicValue,
      v_over_p: vOverP,

      unrealized_pnl: unrealizedPnl,
      current_size: currentPrice === null ? null : currentSize,
      current_quantity: sharesRemaining,
      initial_purchase: initialPurchase,

      market_cap: f.market_cap,
      enterprise_value: f.enterprise_value,
      pe_ratio: f.pe_ratio,
      forward_pe: f.forward_pe,
      eps: f.eps,
      dividend_yield: f.dividend_yield,
      price_to_book: f.price_to_book,
      ev_to_ebitda: f.ev_to_ebitda,
      roe: f.roe,
      beta: f.beta,
      sector: f.sector,
      industry: f.industry,

      _current_size: currentSize,
    });
  }

  const totalEquityMarketValue = drafts.reduce(
    (sum, d) => sum + d._current_size,
    0,
  );

  return drafts
    .map((d): PositionRow => {
      const { _current_size, ...rest } = d;
      return {
        ...rest,
        current_weight:
          _current_size > 0 && totalEquityMarketValue > 0
            ? _current_size / totalEquityMarketValue
            : null,
      };
    })
    .sort((a, b) => (b.current_size ?? 0) - (a.current_size ?? 0));
}

function computeDayChangePct(
  currentPrice: number | null,
  snapshots: { snapshot_date: string; close_price: number }[],
  today: string,
): number | null {
  if (currentPrice === null || snapshots.length === 0) return null;
  const prior = [...snapshots].filter((s) => s.snapshot_date < today).pop();
  if (!prior || prior.close_price === 0) return null;
  return (currentPrice - prior.close_price) / prior.close_price;
}

function computeWindowChangePct(
  currentPrice: number | null,
  snapshots: { snapshot_date: string; close_price: number }[],
  boundary: string,
): number | null {
  if (currentPrice === null || snapshots.length === 0) return null;
  // Ascending-sorted; the closest row with snapshot_date <= boundary is the
  // last one that satisfies it.
  let chosen: { snapshot_date: string; close_price: number } | null = null;
  for (const s of snapshots) {
    if (s.snapshot_date <= boundary) chosen = s;
    else break;
  }
  if (!chosen || chosen.close_price === 0) return null;
  return (currentPrice - chosen.close_price) / chosen.close_price;
}

function computeSinceLastUpdatePct(
  currentPrice: number | null,
  snapshots: { snapshot_date: string; close_price: number }[],
  updatedAtDate: string,
): number | null {
  if (currentPrice === null || snapshots.length === 0) return null;
  // Prefer the snapshot on that exact date, else the latest on or before it.
  let chosen: { snapshot_date: string; close_price: number } | null = null;
  for (const s of snapshots) {
    if (s.snapshot_date <= updatedAtDate) chosen = s;
    else break;
  }
  if (!chosen || chosen.close_price === 0) return null;
  return (currentPrice - chosen.close_price) / chosen.close_price;
}

function yearsBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return (end - start) / (365.25 * 24 * 60 * 60 * 1000);
}

function daysAgoIso(todayIso: string, days: number): string {
  const today = new Date(`${todayIso}T00:00:00Z`).getTime();
  return new Date(today - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
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

// ---------- legacy compatibility ----------
// The dashboard, admin UI, and per-ticker route still consume
// `getPositions` + `TickerPosition`. Kept until the UI agent migrates
// those callers to the new PositionRow contract in lib/portfolio/types.ts.

export type EnrichedLot = AllocatedLot & {
  committee_id: string;
  name: string;
};

export type TickerPosition = {
  ticker: string;
  name: string;
  committee: { id: string; name: string; color: string | null } | null;
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

export async function getTickerPositions(
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
    supabase.from("committees").select("id, name, color"),
  ]);
  if (lotsRes.error) throw lotsRes.error;
  if (tradesRes.error) throw tradesRes.error;
  if (committeesRes.error) throw committeesRes.error;

  const committeesById = new Map(committeesRes.data.map((c) => [c.id, c]));
  const tickers = Array.from(new Set(lotsRes.data.map((l) => l.ticker)));
  const prices = await latestPricesFor(supabase, tickers);

  const lotsByTicker = groupBy(lotsRes.data, (l) => l.ticker);
  const tradesByTicker = groupBy(tradesRes.data, (t) => t.ticker);

  type Row = TickerPosition & { _open: boolean };
  const rows: Row[] = [];

  for (const ticker of tickers) {
    const lots = lotsByTicker.get(ticker) ?? [];
    const trades = tradesByTicker.get(ticker) ?? [];
    const allocated = allocateTradesFifo(lots, trades);
    const enrichedLots: EnrichedLot[] = allocated.map((a) => {
      const source = lots.find((l) => l.id === a.id)!;
      return { ...a, committee_id: source.committee_id, name: source.name };
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

    const primary = enrichedLots[0];
    const committee = primary
      ? committeesById.get(primary.committee_id) ?? null
      : null;

    rows.push({
      _open: sharesRemaining > 0,
      ticker,
      name: primary?.name ?? ticker,
      committee: committee
        ? { id: committee.id, name: committee.name, color: committee.color ?? null }
        : null,
      shares_remaining: round4(sharesRemaining),
      avg_cost_basis: avgCost,
      current_price: currentPrice,
      market_value: marketValue,
      unrealized_pnl: unrealizedPnl,
      unrealized_pct: unrealizedPct,
      realized_pnl: round2(realizedPnl),
      weight: null,
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

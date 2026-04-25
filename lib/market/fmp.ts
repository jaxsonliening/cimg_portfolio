// Quote + profile client, backed by Yahoo Finance via yahoo-finance2.
//
// History: we used to call Financial Modeling Prep. After FMP's Aug-2025
// tier restructuring, more and more endpoints moved behind paid plans
// (legacy /api/v3/quote, then /stable/quote comma-batch, then
// /stable/batch-quote-short). Yahoo Finance has no tier walls, no API
// key, no rate limit we'd actually hit. yahoo-finance2 handles the
// cookie dance and schema normalization.
//
// The file name stays lib/market/fmp.ts and the export shape is
// preserved (fetchQuotes, fetchFullQuotes, fetchProfiles, FmpQuote,
// FmpProfile) so every existing import keeps working.

import YahooFinance from "yahoo-finance2";

// v3 requires instantiation (see yahoo-finance2 UPGRADING.md). One
// module-level instance is reused across every cron fire since
// serverless function warm-starts keep it in memory.
const yahooFinance = new YahooFinance();

export type FmpQuote = {
  symbol: string;
  price: number;
  marketCap: number | null;
  pe: number | null;
  forwardPe: number | null;
  eps: number | null;
  // Day-change shipped straight from Yahoo so the dashboard doesn't
  // depend on price_snapshots having yesterday's close written.
  // decimal — 0.0123 = +1.23%.
  dayChangePct: number | null;
  previousClose: number | null;
  dividendYield: number | null;
};

// Profile carries the metrics that don't show up in the basic quote
// (EV, P/B, EV/EBITDA, ROE, Beta). Yahoo bundles those into the
// quoteSummary `defaultKeyStatistics` / `summaryDetail` / `financialData`
// modules, which we already fetch once per ticker per daily run.
export type FmpProfile = {
  symbol: string;
  sector: string | null;
  industry: string | null;
  companyName: string | null;
  enterpriseValue: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  roe: number | null;            // decimal — 0.18 = 18%
  beta: number | null;
};

type YQuote = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChangePercent?: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  epsTrailingTwelveMonths?: number;
  epsForward?: number;
  trailingAnnualDividendYield?: number;
  dividendYield?: number;
};

type YQuoteSummary = {
  assetProfile?: {
    sector?: string;
    industry?: string;
  };
  price?: {
    longName?: string;
    shortName?: string;
  };
  defaultKeyStatistics?: {
    enterpriseValue?: number;
    priceToBook?: number;
    enterpriseToEbitda?: number;
    forwardPE?: number;
    beta?: number;
  };
  summaryDetail?: {
    beta?: number;
    priceToSalesTrailing12Months?: number;
  };
  financialData?: {
    returnOnEquity?: number;
  };
};

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// Intraday tick path. yahoo-finance2's .quote accepts an array and
// returns an array with matching length (or drops rows it couldn't
// resolve). Values include fundamentals in the same payload.
export async function fetchQuotes(tickers: string[]): Promise<FmpQuote[]> {
  if (tickers.length === 0) return [];

  // Cast to unknown → concrete shape: yahoo-finance2's inferred return
  // type is a big discriminated union and TS can't narrow through
  // Array.isArray cleanly without help.
  const raw = (await yahooFinance.quote(tickers, { return: "array" })) as unknown;
  const list = Array.isArray(raw) ? (raw as YQuote[]) : [raw as YQuote];

  const out: FmpQuote[] = [];
  for (const q of list) {
    if (typeof q.symbol !== "string") continue;
    if (typeof q.regularMarketPrice !== "number") continue;
    // Yahoo reports regularMarketChangePercent as a percent (1.23)
    // not a decimal (0.0123). Normalize here so downstream code can
    // treat it the same as other *_pct fields.
    const pctValue = numOrNull(q.regularMarketChangePercent);
    const dayChangeDecimal = pctValue === null ? null : pctValue / 100;
    // dividendYield varies: some tickers return it as a decimal
    // (0.034), others as percent (3.4). Normalize to decimal on a
    // best-effort basis — anything > 1 is clearly the percent form.
    const rawYield = numOrNull(
      q.trailingAnnualDividendYield ?? q.dividendYield,
    );
    const dividendYieldDecimal =
      rawYield === null ? null : rawYield > 1 ? rawYield / 100 : rawYield;
    out.push({
      symbol: q.symbol,
      price: q.regularMarketPrice,
      marketCap: numOrNull(q.marketCap),
      pe: numOrNull(q.trailingPE ?? q.forwardPE),
      forwardPe: numOrNull(q.forwardPE),
      eps: numOrNull(q.epsTrailingTwelveMonths ?? q.epsForward),
      dayChangePct: dayChangeDecimal,
      previousClose: numOrNull(q.regularMarketPreviousClose),
      dividendYield: dividendYieldDecimal,
    });
  }
  return out;
}

// Daily snapshot path. Yahoo returns fundamentals in the base quote
// response, so same underlying call. Kept as a separate name so daily
// vs tick intent reads clearly in cron/*/route.ts.
export async function fetchFullQuotes(tickers: string[]): Promise<FmpQuote[]> {
  return fetchQuotes(tickers);
}

// Company profile — sector, industry, long name. Run per-symbol in
// parallel since quoteSummary is one-at-a-time. Used only by the
// daily cron (27 symbols, once/day).
export async function fetchProfiles(tickers: string[]): Promise<FmpProfile[]> {
  if (tickers.length === 0) return [];

  const results = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const summary = (await yahooFinance.quoteSummary(ticker, {
          modules: [
            "assetProfile",
            "price",
            "defaultKeyStatistics",
            "summaryDetail",
            "financialData",
          ],
        })) as unknown as YQuoteSummary;
        const ks = summary.defaultKeyStatistics;
        const sd = summary.summaryDetail;
        const fd = summary.financialData;
        return {
          symbol: ticker,
          sector: strOrNull(summary.assetProfile?.sector),
          industry: strOrNull(summary.assetProfile?.industry),
          companyName: strOrNull(
            summary.price?.longName ?? summary.price?.shortName,
          ),
          enterpriseValue: numOrNull(ks?.enterpriseValue),
          priceToBook: numOrNull(ks?.priceToBook),
          evToEbitda: numOrNull(ks?.enterpriseToEbitda),
          // Yahoo returns ROE as a decimal (0.18 = 18%). Pass through
          // unchanged — UI converts to percent at render time.
          roe: numOrNull(fd?.returnOnEquity),
          // Beta lives in defaultKeyStatistics for most equities and
          // summaryDetail for some — fall through.
          beta: numOrNull(ks?.beta ?? sd?.beta),
        };
      } catch {
        // Yahoo occasionally 404s assetProfile for funds/ETFs. Return
        // a null-filled row rather than failing the whole daily run.
        return {
          symbol: ticker,
          sector: null,
          industry: null,
          companyName: null,
          enterpriseValue: null,
          priceToBook: null,
          evToEbitda: null,
          roe: null,
          beta: null,
        };
      }
    }),
  );

  return results;
}

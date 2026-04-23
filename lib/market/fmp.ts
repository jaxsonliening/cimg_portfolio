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

import yahooFinance from "yahoo-finance2";

export type FmpQuote = {
  symbol: string;
  price: number;
  marketCap: number | null;
  pe: number | null;
  eps: number | null;
};

export type FmpProfile = {
  symbol: string;
  sector: string | null;
  industry: string | null;
  companyName: string | null;
};

type YQuote = {
  symbol?: string;
  regularMarketPrice?: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  epsTrailingTwelveMonths?: number;
  epsForward?: number;
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
    out.push({
      symbol: q.symbol,
      price: q.regularMarketPrice,
      marketCap: numOrNull(q.marketCap),
      pe: numOrNull(q.trailingPE ?? q.forwardPE),
      eps: numOrNull(q.epsTrailingTwelveMonths ?? q.epsForward),
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
          modules: ["assetProfile", "price"],
        })) as unknown as YQuoteSummary;
        return {
          symbol: ticker,
          sector: strOrNull(summary.assetProfile?.sector),
          industry: strOrNull(summary.assetProfile?.industry),
          companyName: strOrNull(
            summary.price?.longName ?? summary.price?.shortName,
          ),
        };
      } catch {
        // Yahoo occasionally 404s assetProfile for funds/ETFs. Return
        // a null-filled row rather than failing the whole daily run.
        return {
          symbol: ticker,
          sector: null,
          industry: null,
          companyName: null,
        };
      }
    }),
  );

  return results;
}

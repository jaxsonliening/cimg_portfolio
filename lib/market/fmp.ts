const FMP_BASE = "https://financialmodelingprep.com/api/v3";

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

type RawQuote = {
  symbol?: unknown;
  price?: unknown;
  marketCap?: unknown;
  pe?: unknown;
  eps?: unknown;
};

type RawProfile = {
  symbol?: unknown;
  sector?: unknown;
  industry?: unknown;
  companyName?: unknown;
};

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function apiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY is not set");
  return key;
}

export async function fetchQuotes(tickers: string[]): Promise<FmpQuote[]> {
  if (tickers.length === 0) return [];
  const url = `${FMP_BASE}/quote/${tickers.join(",")}?apikey=${apiKey()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`FMP quote ${res.status}: ${await res.text().catch(() => "")}`);
  const data: RawQuote[] = await res.json();

  return data
    .filter((d): d is RawQuote & { symbol: string; price: number } =>
      typeof d.symbol === "string" && typeof d.price === "number",
    )
    .map((d) => ({
      symbol: d.symbol,
      price: d.price,
      marketCap: numOrNull(d.marketCap),
      pe: numOrNull(d.pe),
      eps: numOrNull(d.eps),
    }));
}

export async function fetchProfiles(tickers: string[]): Promise<FmpProfile[]> {
  if (tickers.length === 0) return [];
  const url = `${FMP_BASE}/profile/${tickers.join(",")}?apikey=${apiKey()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`FMP profile ${res.status}: ${await res.text().catch(() => "")}`);
  const data: RawProfile[] = await res.json();

  return data
    .filter((d): d is RawProfile & { symbol: string } => typeof d.symbol === "string")
    .map((d) => ({
      symbol: d.symbol,
      sector: strOrNull(d.sector),
      industry: strOrNull(d.industry),
      companyName: strOrNull(d.companyName),
    }));
}

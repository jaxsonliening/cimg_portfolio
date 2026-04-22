import { createClient } from "@/lib/supabase/server";
import { getPortfolioSummary } from "@/lib/portfolio/summary";
import { getCommitteeAllocations } from "@/lib/portfolio/committees";
import { getPositions } from "@/lib/portfolio/positions";
import { CommitteePie } from "@/components/committee-pie";
import { PerformanceChart } from "@/components/performance-chart";
import { PositionsTable } from "@/components/positions-table";

export const revalidate = 60;

export default async function Home() {
  const supabase = await createClient();

  // Run reads in parallel so the page serves in one round-trip's worth of latency.
  const [summary, committees, positions] = await Promise.all([
    getPortfolioSummary(supabase),
    getCommitteeAllocations(supabase),
    getPositions(supabase),
  ]);

  // Fundamentals for the table's "Fundamentals" view — one query for all tickers.
  const tickers = Array.from(new Set(positions.map((p) => p.ticker)));
  const { data: snapshots } =
    tickers.length === 0
      ? { data: [] }
      : await supabase
          .from("price_snapshots")
          .select(
            "ticker, snapshot_date, market_cap, enterprise_value, pe_ratio, eps, dividend_yield, sector",
          )
          .in("ticker", tickers)
          .order("snapshot_date", { ascending: false });

  const fundamentals = new Map<string, NonNullable<typeof snapshots>[number]>();
  for (const s of snapshots ?? []) {
    if (!fundamentals.has(s.ticker)) fundamentals.set(s.ticker, s);
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">CIMG Portfolio</h1>
        <p className="mt-1 text-sm text-gray-500">
          Updated every 15 minutes during market hours. As of {summary.as_of}.
        </p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total value"
          primary={fmtCurrency(summary.total_value)}
          secondary={summary.cash > 0 ? `${fmtCurrency(summary.cash)} cash` : undefined}
        />
        <StatCard
          label="Daily P&L"
          primary={summary.daily_pnl === null ? "—" : fmtSigned(summary.daily_pnl)}
          secondary={fmtPct(summary.daily_pct)}
          tone={tone(summary.daily_pnl)}
        />
        <StatCard
          label="YTD P&L"
          primary={summary.ytd_pnl === null ? "—" : fmtSigned(summary.ytd_pnl)}
          secondary={fmtPct(summary.ytd_pct)}
          tone={tone(summary.ytd_pnl)}
        />
        <StatCard
          label="Since inception"
          primary={
            summary.inception_pnl === null ? "—" : fmtSigned(summary.inception_pnl)
          }
          secondary={fmtPct(summary.inception_pct)}
          tone={tone(summary.inception_pnl)}
        />
      </section>

      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <PerformanceChart />
      </section>

      <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-medium">Committee allocation</h2>
          <CommitteePie data={committees} />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 lg:col-span-2">
          <h2 className="mb-4 text-lg font-medium">Positions</h2>
          <PositionsTable
            positions={positions}
            fundamentals={
              new Map(
                Array.from(fundamentals.entries()).map(([k, v]) => [
                  k,
                  {
                    ticker: v.ticker,
                    market_cap: v.market_cap,
                    enterprise_value: v.enterprise_value,
                    pe_ratio: v.pe_ratio,
                    eps: v.eps,
                    dividend_yield: v.dividend_yield,
                    sector: v.sector,
                  },
                ]),
              )
            }
          />
        </div>
      </section>

      <footer className="mt-12 border-t border-gray-200 pt-6 text-xs text-gray-400">
        All data served from the public API at{" "}
        <code className="rounded bg-gray-100 px-1 py-0.5">/api/portfolio/*</code>.
        Source on{" "}
        <a
          href="https://github.com/jaxsonliening/cimg_portfolio"
          className="underline hover:text-gray-600"
        >
          GitHub
        </a>
        .
      </footer>
    </main>
  );
}

function StatCard({
  label,
  primary,
  secondary,
  tone,
}: {
  label: string;
  primary: string;
  secondary?: string;
  tone?: "up" | "down" | "flat";
}) {
  const toneClass =
    tone === "up"
      ? "text-green-600"
      : tone === "down"
        ? "text-red-600"
        : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {primary}
      </div>
      {secondary && (
        <div className="mt-0.5 text-xs tabular-nums text-gray-500">{secondary}</div>
      )}
    </div>
  );
}

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function fmtSigned(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function fmtPct(pct: number | null): string | undefined {
  if (pct === null) return undefined;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${(pct * 100).toFixed(2)}%`;
}

function tone(n: number | null): "up" | "down" | "flat" {
  if (n === null) return "flat";
  return n > 0 ? "up" : n < 0 ? "down" : "flat";
}

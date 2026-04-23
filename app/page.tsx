import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSummary } from "@/lib/portfolio/summary";
import { getPositions } from "@/lib/portfolio/positions";
import { getWinnersLosers } from "@/lib/portfolio/winners-losers";
import { getCommitteeAllocations } from "@/lib/portfolio/committees";
import { CommitteePie } from "@/components/committee-pie";
import { PerformanceChart } from "@/components/performance-chart";
import { PositionsTable } from "@/components/positions-table";
import { SummaryPanel } from "@/components/summary-panel";
import { WinnersLosersPanel } from "@/components/winners-losers-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { ExportAllButton } from "@/components/export-all-button";
import { RiskMetricsPanel } from "@/components/risk-metrics-panel";
import { AttributionPanel } from "@/components/attribution-panel";

export const revalidate = 60;

export default async function Home() {
  const supabase = await createClient();

  const [summary, positions, moves, committees] = await Promise.all([
    getSummary(supabase),
    getPositions(supabase),
    getWinnersLosers(supabase),
    getCommitteeAllocations(supabase),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-8 flex flex-col gap-3 sm:mb-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            CIMG Portfolio
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Prices as of {summary.as_of}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportAllButton
            summary={summary}
            positions={positions}
            moves={moves}
          />
          <Link
            href="/admin"
            className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm transition-all hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow"
          >
            Admin Sign In
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <section className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SummaryPanel summary={summary} />
        </div>
        <div className="lg:col-span-1">
          <WinnersLosersPanel summary={summary} moves={moves} />
        </div>
      </section>

      <section className="mb-8">
        <RiskMetricsPanel summary={summary} />
      </section>

      <section className="mb-8">
        <AttributionPanel positions={positions} summary={summary} />
      </section>

      <section className="mb-8 rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
        <PerformanceChart />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
          Positions
        </h2>
        <PositionsTable positions={positions} />
      </section>

      <section className="mb-8 rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
        <h2 className="mb-4 text-lg font-medium">Committee Allocation</h2>
        <CommitteePie data={committees} />
      </section>

      <footer className="mt-12 border-t border-gray-200/70 dark:border-gray-800 pt-6 text-xs text-gray-400 dark:text-gray-500">
        <a
          href="https://github.com/jaxsonliening/cimg_portfolio"
          className="underline hover:text-gray-600 dark:hover:text-gray-300"
        >
          Source on GitHub
        </a>
      </footer>
    </main>
  );
}

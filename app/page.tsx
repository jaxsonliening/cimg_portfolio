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
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">CIMG Portfolio</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Updated every 15 minutes during market hours. As of {summary.as_of}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Admin Sign In
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SummaryPanel summary={summary} />
        </div>
        <div className="lg:col-span-1">
          <WinnersLosersPanel summary={summary} moves={moves} />
        </div>
      </section>

      <section className="mb-8 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <PerformanceChart />
      </section>

      <section className="mb-8 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <h2 className="mb-4 text-lg font-medium">Committee Allocation</h2>
        <CommitteePie data={committees} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Positions
        </h2>
        <PositionsTable positions={positions} />
      </section>

      <footer className="mt-12 border-t border-gray-200 dark:border-gray-800 pt-6 text-xs text-gray-400 dark:text-gray-500">
        All data served from the public API at{" "}
        <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5">/api/portfolio/*</code>.
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

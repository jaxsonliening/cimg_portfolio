import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTickerPositions } from "@/lib/portfolio/positions";
import { AdminPositionsTable } from "./admin-positions-table";
import { RunPortfolioUpdateButton } from "./run-portfolio-update-button";
import { LastUpdateBanner } from "./last-update-banner";

export default async function AdminHome() {
  const supabase = await createClient();

  const positions = await getTickerPositions(supabase, { includeClosed: true });
  const open = positions.filter((p) => p.shares_remaining > 0);
  const closed = positions.filter((p) => p.shares_remaining === 0);

  const { data: cashRows } = await supabase
    .from("cash_transactions")
    .select("amount, kind");
  const cash = (cashRows ?? []).reduce((sum, r) => sum + r.amount, 0);
  const dividendTotal = (cashRows ?? [])
    .filter((r) => r.kind === "dividend")
    .reduce((sum, r) => sum + r.amount, 0);

  // The last-update banner needs max(value_updated_at) across ticker_meta —
  // same definition as summary.last_update_trading_day. Pulling it directly
  // here so the admin page doesn't have to compute the whole summary.
  const { data: metaRows } = await supabase
    .from("ticker_meta")
    .select("value_updated_at");
  let lastUpdate: string | null = null;
  for (const m of metaRows ?? []) {
    if (!m.value_updated_at) continue;
    const d = m.value_updated_at.slice(0, 10);
    if (lastUpdate === null || d > lastUpdate) lastUpdate = d;
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio Admin</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Cash balance {fmt(cash)} &middot; Dividends total {fmt(dividendTotal)}
          </p>
          <div className="mt-2">
            <LastUpdateBanner lastUpdate={lastUpdate} />
          </div>
        </div>
        <div className="flex gap-2">
          <RunPortfolioUpdateButton />
          <Link
            href="/admin/cash"
            className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm transition-all hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow"
          >
            Cash &amp; Dividends
          </Link>
          <Link
            href="/admin/positions/new"
            className="rounded-lg bg-gray-900 dark:bg-gray-100 px-3 py-2 text-sm font-medium text-white dark:text-gray-900 shadow-sm transition-all hover:bg-gray-800 dark:hover:bg-gray-200"
          >
            + Add Position
          </Link>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
          Open Positions ({open.length})
        </h2>
        {open.length === 0 ? (
          <EmptyHint>
            No open positions yet. Click <em>Add Position</em> to log the first buy.
          </EmptyHint>
        ) : (
          <AdminPositionsTable rows={open} closable />
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
            Closed ({closed.length})
          </h2>
          <AdminPositionsTable rows={closed} closable={false} />
        </section>
      )}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
      {children}
    </div>
  );
}

function fmt(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

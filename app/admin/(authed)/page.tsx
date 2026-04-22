import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPositions } from "@/lib/portfolio/positions";
import { SellSharesButton } from "./sell-shares-button";

export default async function AdminHome() {
  const supabase = await createClient();

  const positions = await getPositions(supabase, { includeClosed: true });
  const open = positions.filter((p) => p.shares_remaining > 0);
  const closed = positions.filter((p) => p.shares_remaining === 0);

  const { data: cashRows } = await supabase
    .from("cash_transactions")
    .select("amount, kind");
  const cash = (cashRows ?? []).reduce((sum, r) => sum + r.amount, 0);
  const dividendTotal = (cashRows ?? [])
    .filter((r) => r.kind === "dividend")
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio admin</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Cash balance {fmt(cash)} &middot; Dividends total {fmt(dividendTotal)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/cash"
            className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cash &amp; dividends
          </Link>
          <Link
            href="/admin/positions/new"
            className="rounded-md bg-gray-900 dark:bg-gray-100 px-3 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200"
          >
            + Add position
          </Link>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Open positions ({open.length})
        </h2>
        {open.length === 0 ? (
          <EmptyHint>
            No open positions yet. Click <em>Add position</em> to log the first buy.
          </EmptyHint>
        ) : (
          <PositionTable rows={open} closable />
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Closed ({closed.length})
          </h2>
          <PositionTable rows={closed} closable={false} />
        </section>
      )}
    </div>
  );
}

type Row = Awaited<ReturnType<typeof getPositions>>[number];

function PositionTable({ rows, closable }: { rows: Row[]; closable: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <tr>
            <th className="px-4 py-2 font-medium">Ticker</th>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Committee</th>
            <th className="px-4 py-2 text-right font-medium">Shares</th>
            <th className="px-4 py-2 text-right font-medium">Avg cost</th>
            <th className="px-4 py-2 text-right font-medium">Current</th>
            <th className="px-4 py-2 text-right font-medium">Market value</th>
            <th className="px-4 py-2 text-right font-medium">Unrealized</th>
            <th className="px-4 py-2 text-right font-medium">Realized</th>
            {closable && <th className="px-4 py-2 font-medium">Sell</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((p) => (
            <tr key={p.ticker}>
              <td className="px-4 py-2 font-medium">{p.ticker}</td>
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{p.name}</td>
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                {p.committee?.name ?? "—"}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {p.shares_remaining}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {p.avg_cost_basis !== null ? `$${p.avg_cost_basis.toFixed(2)}` : "—"}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {p.current_price !== null ? `$${p.current_price.toFixed(2)}` : "—"}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {p.market_value !== null ? fmt(p.market_value) : "—"}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {p.unrealized_pnl !== null ? fmtSigned(p.unrealized_pnl) : "—"}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {p.realized_pnl !== 0 ? fmtSigned(p.realized_pnl) : "—"}
              </td>
              {closable && (
                <td className="px-4 py-2">
                  <SellSharesButton
                    ticker={p.ticker}
                    maxShares={p.shares_remaining}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
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

function fmtSigned(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

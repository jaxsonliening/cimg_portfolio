import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CashForm } from "./cash-form";

export default async function CashAdminPage() {
  const supabase = await createClient();

  const [txRes, positionsRes] = await Promise.all([
    supabase
      .from("cash_transactions")
      .select("id, amount, kind, ticker, occurred_at, note")
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("positions").select("ticker"),
  ]);

  const transactions = txRes.data ?? [];
  const tickers = Array.from(
    new Set((positionsRes.data ?? []).map((p) => p.ticker)),
  ).sort();

  const balance = transactions.reduce((sum, t) => sum + t.amount, 0);
  const thisYear = String(new Date().getUTCFullYear());
  const dividendYtd = transactions
    .filter((t) => t.kind === "dividend" && t.occurred_at.startsWith(thisYear))
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cash &amp; Dividends</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Recent balance {fmt(balance)} &middot; Dividend income YTD {fmt(dividendYtd)}
          </p>
        </div>
        <Link href="/admin" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">
          ← Back to Admin
        </Link>
      </div>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            New Transaction
          </h2>
          <CashForm tickers={tickers} />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Recent ({transactions.length})
          </h2>
          {transactions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No cash transactions yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <table className="min-w-full text-sm">
                <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Kind</th>
                    <th className="px-3 py-2 font-medium">Ticker</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{t.occurred_at}</td>
                      <td className="px-3 py-1.5">
                        <KindBadge kind={t.kind} />
                      </td>
                      <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{t.ticker ?? "—"}</td>
                      <td
                        className={`px-3 py-1.5 text-right tabular-nums ${
                          t.amount >= 0 ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {fmtSigned(t.amount)}
                      </td>
                      <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{t.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const palette: Record<string, string> = {
    deposit: "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300",
    withdrawal: "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300",
    dividend: "bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300",
    trade_buy: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
    trade_sell: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
    fee: "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300",
    adjustment: "bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${palette[kind] ?? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"}`}
    >
      {kind}
    </span>
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

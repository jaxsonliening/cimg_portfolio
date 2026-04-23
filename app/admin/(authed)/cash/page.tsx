import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CashForm } from "./cash-form";
import { RecentList, type CashTx } from "./recent-list";

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

  const transactions: CashTx[] = txRes.data ?? [];
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
          <RecentList transactions={transactions} tickers={tickers} />
        </div>
      </section>
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

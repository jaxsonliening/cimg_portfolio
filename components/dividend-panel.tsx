import type { DividendSummary } from "@/lib/portfolio/dividends";
import { fmtCurrency, fmtDateShort } from "./format";

// Dividend income card for the public dashboard. Hides entirely when
// the group has never recorded a dividend, so the default state is a
// clean omission rather than a table full of zeros.

export function DividendPanel({ summary }: { summary: DividendSummary }) {
  if (summary.by_ticker.length === 0) return null;

  const stats: StatItem[] = [
    { label: "YTD", value: summary.ytd_total },
    { label: "Trailing 12M", value: summary.twelve_month_total },
    { label: "All Time", value: summary.all_time_total },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm transition-shadow hover:shadow-md">
      <div className="border-b border-gray-100 dark:border-gray-800 px-5 py-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
          Dividend Income
        </h2>
        <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
          Cash dividends received, sorted by year-to-date
        </p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800">
        {stats.map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} />
        ))}
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
        {summary.by_ticker.map((row) => (
          <li
            key={row.ticker}
            className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: row.committee?.color ?? "#9ca3af",
                }}
                aria-hidden
              />
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-900 dark:text-gray-100">
                  {row.name}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  {row.ticker}
                  {row.latest_payment ? (
                    <>
                      {" · last paid "}
                      {fmtDateShort(row.latest_payment)}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                {fmtCurrency(row.ytd_amount)}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                {fmtCurrency(row.twelve_month_amount)} TTM
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type StatItem = { label: string; value: number };

function Stat({ label, value }: StatItem) {
  return (
    <div className="px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
        {fmtCurrency(value)}
      </div>
    </div>
  );
}

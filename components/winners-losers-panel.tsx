import type { PortfolioSummary, WinnersLosers, MoverRow } from "@/lib/portfolio/types";
import { fmtDateShort, fmtPctSigned } from "./format";

export function WinnersLosersPanel({
  summary,
  moves,
}: {
  summary: PortfolioSummary;
  moves: WinnersLosers;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
        <div className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Since Last Update Toggle
        </div>
        <div className="mt-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Last Update Trading Day
        </div>
        <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
          {fmtDateShort(summary.last_update_trading_day)}
        </div>
      </div>

      <MoversCard title="Biggest Winners" rows={moves.winners} variant="up" />
      <MoversCard title="Biggest Losers" rows={moves.losers} variant="down" />
    </div>
  );
}

function MoversCard({
  title,
  rows,
  variant,
}: {
  title: string;
  rows: MoverRow[];
  variant: "up" | "down";
}) {
  const rowBg =
    variant === "up"
      ? "bg-green-50 dark:bg-green-950/40"
      : "bg-red-50 dark:bg-red-950/40";
  const textTone =
    variant === "up"
      ? "text-green-700 dark:text-green-400"
      : "text-red-700 dark:text-red-400";

  const padded: (MoverRow | null)[] = [...rows];
  while (padded.length < 3) padded.push(null);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {title}
        </h3>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {padded.map((m, i) => (
          <li
            key={m?.ticker ?? `empty-${i}`}
            className={`flex items-center justify-between px-4 py-2 text-sm ${
              m ? rowBg : ""
            }`}
          >
            {m ? (
              <>
                <div className="min-w-0">
                  <div className={`truncate font-medium ${textTone}`}>{m.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {m.ticker}
                  </div>
                </div>
                <div className={`tabular-nums font-semibold ${textTone}`}>
                  {fmtPctSigned(m.day_change_pct)}
                </div>
              </>
            ) : (
              <span className="text-gray-400 dark:text-gray-600">—</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

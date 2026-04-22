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
      <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 px-5 py-4 shadow-sm transition-shadow hover:shadow-md">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
          Since Last Update
        </div>
        <div className="mt-3 text-[11px] uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
          Last Update Trading Day
        </div>
        <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
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
      ? "bg-emerald-50/70 dark:bg-emerald-950/30"
      : "bg-rose-50/70 dark:bg-rose-950/30";
  const textTone =
    variant === "up"
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-rose-700 dark:text-rose-400";
  const glyph = variant === "up" ? "▲" : "▼";

  const padded: (MoverRow | null)[] = [...rows];
  while (padded.length < 3) padded.push(null);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-5 py-3.5">
        <span className={`text-xs ${textTone}`}>{glyph}</span>
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
          {title}
        </h3>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {padded.map((m, i) => (
          <li
            key={m?.ticker ?? `empty-${i}`}
            className={`flex items-center justify-between px-5 py-2.5 text-sm transition-colors ${
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
              <span className="text-gray-300 dark:text-gray-700">—</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

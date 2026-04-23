import type { PortfolioSummary } from "@/lib/portfolio/types";
import { fmtNumber, fmtPctPlain } from "./format";

// Four standard fund-reporting metrics, computed over the post-
// capital-injection window so the Mar-2020 step doesn't skew them.
// Rendered as compact stat cards beneath the summary panel.

export function RiskMetricsPanel({ summary }: { summary: PortfolioSummary }) {
  const items: Item[] = [
    {
      label: "Beta (vs S&P 500)",
      value: fmtNumber(summary.beta, 2),
      sublabel: describeBeta(summary.beta),
    },
    {
      label: "Volatility (annualized)",
      value: fmtPctPlain(summary.volatility, 1),
      sublabel: "30d–window stdev × √252",
    },
    {
      label: "Sharpe Ratio",
      value: fmtNumber(summary.sharpe, 2),
      sublabel: "vs. 4% risk-free",
    },
    {
      label: "Max Drawdown",
      value: fmtPctPlain(summary.max_drawdown, 1),
      sublabel: "Peak-to-trough",
      negativeTone: true,
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm transition-shadow hover:shadow-md">
      <div className="border-b border-gray-100 dark:border-gray-800 px-5 py-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
          Risk Metrics
        </h2>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 dark:divide-gray-800 sm:grid-cols-4 sm:divide-y-0">
        {items.map((item) => (
          <Stat key={item.label} {...item} />
        ))}
      </div>
    </div>
  );
}

type Item = {
  label: string;
  value: string;
  sublabel: string;
  negativeTone?: boolean;
};

function Stat({ label, value, sublabel, negativeTone }: Item) {
  const tone = negativeTone
    ? "text-rose-600 dark:text-rose-400"
    : "text-gray-900 dark:text-gray-100";
  return (
    <div className="px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
        {sublabel}
      </div>
    </div>
  );
}

function describeBeta(beta: number | null): string {
  if (beta === null) return "Not enough history yet";
  if (beta < 0.8) return "Less volatile than SPY";
  if (beta > 1.2) return "More volatile than SPY";
  return "Tracks SPY closely";
}

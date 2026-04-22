"use client";

import type { PortfolioSummary } from "@/lib/portfolio/types";
import { ExportButton } from "./export-button";
import {
  fmtCurrency,
  fmtNumber,
  fmtPctPlain,
  fmtPctSigned,
  toneClass,
} from "./format";

type Row = {
  label: string;
  formatted: string;
  raw: number | null;
  bold?: boolean;
  tone?: number | null;
};

export function SummaryPanel({ summary }: { summary: PortfolioSummary }) {
  const rows: Row[] = [
    { label: "Market Value of Equities", formatted: fmtCurrency(summary.market_value_equities), raw: summary.market_value_equities },
    { label: "Cash Balance", formatted: fmtCurrency(summary.cash_balance), raw: summary.cash_balance },
    { label: "Cash Position %", formatted: fmtPctPlain(summary.cash_position_pct, 2), raw: summary.cash_position_pct },
    { label: "Market Value of Portfolio", formatted: fmtCurrency(summary.market_value_portfolio), raw: summary.market_value_portfolio, bold: true },
    { label: "Intrinsic Value of Portfolio", formatted: fmtCurrency(summary.intrinsic_value_portfolio), raw: summary.intrinsic_value_portfolio },
    { label: "Equity Portfolio V/P (ex-Cash)", formatted: fmtNumber(summary.equity_vp_ex_cash, 2), raw: summary.equity_vp_ex_cash },
    { label: "CIMG Performance Pre Capital Injection", formatted: fmtPctSigned(summary.cimg_pre_capital_injection_pct), raw: summary.cimg_pre_capital_injection_pct, tone: summary.cimg_pre_capital_injection_pct },
    { label: "SPY Performance Pre Capital Injection", formatted: fmtPctSigned(summary.spy_pre_capital_injection_pct), raw: summary.spy_pre_capital_injection_pct, tone: summary.spy_pre_capital_injection_pct },
    { label: "CIMG Performance Post Capital Injection", formatted: fmtPctSigned(summary.cimg_post_capital_injection_pct), raw: summary.cimg_post_capital_injection_pct, tone: summary.cimg_post_capital_injection_pct },
    { label: "SPY Performance Post Capital Injection", formatted: fmtPctSigned(summary.spy_post_capital_injection_pct), raw: summary.spy_post_capital_injection_pct, tone: summary.spy_post_capital_injection_pct },
    { label: "CIMG Performance YTD", formatted: fmtPctSigned(summary.cimg_ytd_pct), raw: summary.cimg_ytd_pct, tone: summary.cimg_ytd_pct },
    { label: "SPY Performance YTD", formatted: fmtPctSigned(summary.spy_ytd_pct), raw: summary.spy_ytd_pct, tone: summary.spy_ytd_pct },
    { label: "CIMG Day Change", formatted: fmtPctSigned(summary.cimg_day_change_pct), raw: summary.cimg_day_change_pct, tone: summary.cimg_day_change_pct },
    { label: "SPY Day Change", formatted: fmtPctSigned(summary.spy_day_change_pct), raw: summary.spy_day_change_pct, tone: summary.spy_day_change_pct },
  ];

  const build = () => ({
    headers: ["Metric", "Value", "Formatted"],
    rows: rows.map((r) => [r.label, r.raw, r.formatted]),
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-5 py-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
          Portfolio Summary
        </h2>
        <ExportButton filename="summary.csv" build={build} />
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((r) => (
            <tr key={r.label} className="transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/40">
              <td
                className={`px-5 py-2.5 text-gray-600 dark:text-gray-300 ${
                  r.bold ? "font-semibold text-gray-900 dark:text-gray-100" : ""
                }`}
              >
                {r.label}
              </td>
              <td
                className={`px-5 py-2.5 text-right tabular-nums ${
                  r.bold ? "font-semibold text-gray-900 dark:text-gray-100" : ""
                } ${r.tone !== undefined ? toneClass(r.tone) : ""}`}
              >
                {r.formatted}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

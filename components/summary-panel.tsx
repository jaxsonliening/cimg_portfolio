import type { PortfolioSummary } from "@/lib/portfolio/types";
import {
  fmtCurrency,
  fmtNumber,
  fmtPctPlain,
  fmtPctSigned,
  toneClass,
} from "./format";

export function SummaryPanel({ summary }: { summary: PortfolioSummary }) {
  const rows: Row[] = [
    { label: "Market Value of Equities", value: fmtCurrency(summary.market_value_equities) },
    { label: "Cash Balance", value: fmtCurrency(summary.cash_balance) },
    { label: "Cash Position %", value: fmtPctPlain(summary.cash_position_pct, 2) },
    {
      label: "Market Value of Portfolio",
      value: fmtCurrency(summary.market_value_portfolio),
      bold: true,
    },
    {
      label: "Intrinsic Value of Portfolio",
      value: fmtCurrency(summary.intrinsic_value_portfolio),
    },
    {
      label: "Equity Portfolio V/P (ex-Cash)",
      value: fmtNumber(summary.equity_vp_ex_cash, 2),
    },
    {
      label: "CIMG Performance Pre Capital Injection",
      value: fmtPctSigned(summary.cimg_pre_capital_injection_pct),
      tone: summary.cimg_pre_capital_injection_pct,
    },
    {
      label: "SPY Performance Pre Capital Injection",
      value: fmtPctSigned(summary.spy_pre_capital_injection_pct),
      tone: summary.spy_pre_capital_injection_pct,
    },
    {
      label: "CIMG Performance Post Capital Injection",
      value: fmtPctSigned(summary.cimg_post_capital_injection_pct),
      tone: summary.cimg_post_capital_injection_pct,
    },
    {
      label: "SPY Performance Post Capital Injection",
      value: fmtPctSigned(summary.spy_post_capital_injection_pct),
      tone: summary.spy_post_capital_injection_pct,
    },
    {
      label: "CIMG Performance YTD",
      value: fmtPctSigned(summary.cimg_ytd_pct),
      tone: summary.cimg_ytd_pct,
    },
    {
      label: "SPY Performance YTD",
      value: fmtPctSigned(summary.spy_ytd_pct),
      tone: summary.spy_ytd_pct,
    },
    {
      label: "CIMG Day Change",
      value: fmtPctSigned(summary.cimg_day_change_pct),
      tone: summary.cimg_day_change_pct,
    },
    {
      label: "SPY Day Change",
      value: fmtPctSigned(summary.spy_day_change_pct),
      tone: summary.spy_day_change_pct,
    },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Portfolio Summary
        </h2>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((r) => (
            <tr key={r.label}>
              <td
                className={`px-4 py-2 text-gray-700 dark:text-gray-300 ${
                  r.bold ? "font-semibold text-gray-900 dark:text-gray-100" : ""
                }`}
              >
                {r.label}
              </td>
              <td
                className={`px-4 py-2 text-right tabular-nums ${
                  r.bold ? "font-semibold text-gray-900 dark:text-gray-100" : ""
                } ${r.tone !== undefined ? toneClass(r.tone) : ""}`}
              >
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Row = {
  label: string;
  value: string;
  bold?: boolean;
  tone?: number | null;
};

import type { PositionRow } from "@/lib/portfolio/types";
import {
  fmtCurrency,
  fmtDateShort,
  fmtInteger,
  fmtNumber,
  fmtPctPlain,
  fmtPctSigned,
  fmtSignedCurrency,
  toneClass,
} from "./format";

export function PositionsTable({ positions }: { positions: PositionRow[] }) {
  if (positions.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm text-gray-400 dark:text-gray-500">
        No open positions yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <tr>
            <Th>Company</Th>
            <Th>Ticker</Th>
            <Th right>Day Change</Th>
            <Th right>Week Change</Th>
            <Th right>Month Change</Th>
            <Th right>Since Last Update</Th>
            <Th right>Total Return</Th>
            <Th right>Annualized Return</Th>
            <Th right>Current Price</Th>
            <Th right>Average Cost</Th>
            <Th right>Current Weight</Th>
            <Th right>Target Weight</Th>
            <Th right>Intrinsic Value Estimate</Th>
            <Th right>V/P</Th>
            <Th right>Unrealized P/L</Th>
            <Th right>Current Size</Th>
            <Th right>Current Quantity</Th>
            <Th right>Initial Purchase</Th>
            <Th>Committee</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {positions.map((p) => (
            <tr key={p.ticker} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <Td strong>{p.name}</Td>
              <Td strong>{p.ticker}</Td>
              <TdPct value={p.day_change_pct} />
              <TdPct value={p.week_change_pct} />
              <TdPct value={p.month_change_pct} />
              <TdPct value={p.since_last_update_pct} />
              <TdPct value={p.total_return_pct} />
              <Td right tone={p.annualized_return_pct}>
                {p.held_less_than_one_year
                  ? "<1Yr"
                  : fmtPctSigned(p.annualized_return_pct)}
              </Td>
              <Td right>{fmtCurrency(p.current_price)}</Td>
              <Td right>{fmtCurrency(p.avg_cost)}</Td>
              <Td right>{fmtPctPlain(p.current_weight, 1)}</Td>
              <Td right>{fmtPctPlain(p.target_weight, 1)}</Td>
              <Td right>{fmtCurrency(p.intrinsic_value)}</Td>
              <Td right>{fmtNumber(p.v_over_p, 2)}</Td>
              <Td right tone={p.unrealized_pnl}>
                {fmtSignedCurrency(p.unrealized_pnl)}
              </Td>
              <Td right>{fmtCurrency(p.current_size)}</Td>
              <Td right>{fmtInteger(p.current_quantity)}</Td>
              <Td right>{fmtDateShort(p.initial_purchase)}</Td>
              <Td>{p.committee?.name ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2 font-medium ${
        right ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  strong,
  tone,
}: {
  children: React.ReactNode;
  right?: boolean;
  strong?: boolean;
  tone?: number | null;
}) {
  const base = right ? "text-right tabular-nums" : "";
  const weight = strong
    ? "font-medium text-gray-900 dark:text-gray-100"
    : "text-gray-700 dark:text-gray-300";
  const color = tone !== undefined ? toneClass(tone) : weight;
  return (
    <td className={`whitespace-nowrap px-3 py-2 ${base} ${color}`}>{children}</td>
  );
}

function TdPct({ value }: { value: number | null }) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${toneClass(value)}`}
    >
      {fmtPctSigned(value)}
    </td>
  );
}

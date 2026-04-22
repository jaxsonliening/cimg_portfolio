"use client";

import { useState } from "react";
import type { TickerPosition } from "@/lib/portfolio/positions";

type Fundamentals = {
  ticker: string;
  market_cap: number | null;
  enterprise_value: number | null;
  pe_ratio: number | null;
  eps: number | null;
  dividend_yield: number | null;
  sector: string | null;
};

export function PositionsTable({
  positions,
  fundamentals,
}: {
  positions: TickerPosition[];
  fundamentals: Map<string, Fundamentals>;
}) {
  const [view, setView] = useState<"portfolio" | "fundamentals">("portfolio");

  if (positions.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md bg-gray-50 dark:bg-gray-800 text-sm text-gray-400 dark:text-gray-500">
        No open positions yet.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex justify-end gap-1">
        {(["portfolio", "fundamentals"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-2.5 py-1 text-xs ${
              v === view
                ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                : "border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            {v === "portfolio" ? "Portfolio" : "Fundamentals"}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {view === "portfolio" ? <PortfolioHead /> : <FundamentalsHead />}
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {positions.map((p) => (
              <tr key={p.ticker}>
                {view === "portfolio" ? (
                  <PortfolioRow p={p} />
                ) : (
                  <FundamentalsRow p={p} f={fundamentals.get(p.ticker) ?? null} />
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PortfolioHead() {
  return (
    <tr>
      <Th>Ticker</Th>
      <Th>Name</Th>
      <Th>Committee</Th>
      <Th right>Shares</Th>
      <Th right>Avg Cost</Th>
      <Th right>Current</Th>
      <Th right>Market Value</Th>
      <Th right>Unrealized</Th>
      <Th right>Realized</Th>
      <Th right>Weight</Th>
    </tr>
  );
}

function PortfolioRow({ p }: { p: TickerPosition }) {
  return (
    <>
      <Td strong>{p.ticker}</Td>
      <Td>{p.name}</Td>
      <Td>{p.committee?.name ?? "—"}</Td>
      <Td right>{p.shares_remaining}</Td>
      <Td right>{p.avg_cost_basis !== null ? `$${p.avg_cost_basis.toFixed(2)}` : "—"}</Td>
      <Td right>{p.current_price !== null ? `$${p.current_price.toFixed(2)}` : "—"}</Td>
      <Td right>{p.market_value !== null ? `$${p.market_value.toLocaleString()}` : "—"}</Td>
      <Td right>
        {p.unrealized_pnl !== null && p.unrealized_pct !== null ? (
          <span className={p.unrealized_pnl >= 0 ? "text-green-600" : "text-red-600"}>
            {p.unrealized_pnl >= 0 ? "+" : ""}
            ${Math.abs(p.unrealized_pnl).toLocaleString()} (
            {(p.unrealized_pct * 100).toFixed(2)}%)
          </span>
        ) : (
          "—"
        )}
      </Td>
      <Td right>
        {p.realized_pnl !== 0 ? (
          <span className={p.realized_pnl >= 0 ? "text-green-600" : "text-red-600"}>
            {p.realized_pnl >= 0 ? "+" : ""}
            ${Math.abs(p.realized_pnl).toLocaleString()}
          </span>
        ) : (
          "—"
        )}
      </Td>
      <Td right>{p.weight !== null ? `${(p.weight * 100).toFixed(1)}%` : "—"}</Td>
    </>
  );
}

function FundamentalsHead() {
  return (
    <tr>
      <Th>Ticker</Th>
      <Th right>Market Cap</Th>
      <Th right>Enterprise Value</Th>
      <Th right>P/E</Th>
      <Th right>EPS</Th>
      <Th right>Div Yield</Th>
      <Th>Sector</Th>
    </tr>
  );
}

function FundamentalsRow({
  p,
  f,
}: {
  p: TickerPosition;
  f: Fundamentals | null;
}) {
  return (
    <>
      <Td strong>{p.ticker}</Td>
      <Td right>{f?.market_cap != null ? fmtCurrency(f.market_cap) : "—"}</Td>
      <Td right>{f?.enterprise_value != null ? fmtCurrency(f.enterprise_value) : "—"}</Td>
      <Td right>{f?.pe_ratio != null ? f.pe_ratio.toFixed(1) : "—"}</Td>
      <Td right>{f?.eps != null ? `$${f.eps.toFixed(2)}` : "—"}</Td>
      <Td right>
        {f?.dividend_yield != null ? `${(f.dividend_yield * 100).toFixed(2)}%` : "—"}
      </Td>
      <Td>{f?.sector ?? "—"}</Td>
    </>
  );
}

function Th({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: boolean;
}) {
  return (
    <th className={`px-4 py-2 font-medium ${right ? "text-right" : ""}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  strong,
}: {
  children: React.ReactNode;
  right?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      className={`px-4 py-2 ${right ? "text-right tabular-nums" : ""} ${
        strong ? "font-medium" : "text-gray-700 dark:text-gray-300"
      }`}
    >
      {children}
    </td>
  );
}

function fmtCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

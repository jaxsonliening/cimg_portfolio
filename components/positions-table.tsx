"use client";

import { useState } from "react";
import type { EnrichedPosition } from "@/lib/portfolio/positions";

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
  positions: EnrichedPosition[];
  fundamentals: Map<string, Fundamentals>;
}) {
  const [view, setView] = useState<"portfolio" | "fundamentals">("portfolio");

  if (positions.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md bg-gray-50 text-sm text-gray-400">
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
                ? "bg-gray-900 text-white"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {v === "portfolio" ? "Portfolio" : "Fundamentals"}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            {view === "portfolio" ? <PortfolioHead /> : <FundamentalsHead />}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {positions.map((p) => (
              <tr key={p.id}>
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
      <Th right>Cost basis</Th>
      <Th>Purchased</Th>
      <Th right>Current</Th>
      <Th right>Market value</Th>
      <Th right>Unrealized</Th>
      <Th right>Weight</Th>
    </tr>
  );
}

function PortfolioRow({ p }: { p: EnrichedPosition }) {
  return (
    <>
      <Td strong>{p.ticker}</Td>
      <Td>{p.name}</Td>
      <Td>{p.committee?.name ?? "—"}</Td>
      <Td right>{p.shares}</Td>
      <Td right>${p.cost_basis.toFixed(2)}</Td>
      <Td>{p.purchased_at}</Td>
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
      <Td right>{p.weight !== null ? `${(p.weight * 100).toFixed(1)}%` : "—"}</Td>
    </>
  );
}

function FundamentalsHead() {
  return (
    <tr>
      <Th>Ticker</Th>
      <Th right>Market cap</Th>
      <Th right>Enterprise value</Th>
      <Th right>P/E</Th>
      <Th right>EPS</Th>
      <Th right>Div yield</Th>
      <Th>Sector</Th>
    </tr>
  );
}

function FundamentalsRow({
  p,
  f,
}: {
  p: EnrichedPosition;
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
        strong ? "font-medium" : "text-gray-700"
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

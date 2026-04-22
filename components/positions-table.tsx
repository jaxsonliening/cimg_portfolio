"use client";

import { useMemo, useState } from "react";
import type { PositionRow } from "@/lib/portfolio/types";
import { ExportButton } from "./export-button";
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

type SortKey =
  | "name"
  | "ticker"
  | "day_change_pct"
  | "week_change_pct"
  | "month_change_pct"
  | "since_last_update_pct"
  | "total_return_pct"
  | "annualized_return_pct"
  | "current_price"
  | "avg_cost"
  | "current_weight"
  | "target_weight"
  | "intrinsic_value"
  | "v_over_p"
  | "unrealized_pnl"
  | "current_size"
  | "current_quantity"
  | "initial_purchase"
  | "committee";

type SortDir = "asc" | "desc";

type ColumnDef = {
  key: SortKey;
  label: string;
  right?: boolean;
  csv: string;
  csvValue: (p: PositionRow) => string | number | null;
};

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Company", csv: "Company", csvValue: (p) => p.name },
  { key: "ticker", label: "Ticker", csv: "Ticker", csvValue: (p) => p.ticker },
  { key: "day_change_pct", label: "Day Change", right: true, csv: "Day Change (decimal)", csvValue: (p) => p.day_change_pct },
  { key: "week_change_pct", label: "Week Change", right: true, csv: "Week Change (decimal)", csvValue: (p) => p.week_change_pct },
  { key: "month_change_pct", label: "Month Change", right: true, csv: "Month Change (decimal)", csvValue: (p) => p.month_change_pct },
  { key: "since_last_update_pct", label: "Since Last Update", right: true, csv: "Since Last Update (decimal)", csvValue: (p) => p.since_last_update_pct },
  { key: "total_return_pct", label: "Total Return", right: true, csv: "Total Return (decimal)", csvValue: (p) => p.total_return_pct },
  { key: "annualized_return_pct", label: "Annualized Return", right: true, csv: "Annualized Return (decimal)", csvValue: (p) => (p.held_less_than_one_year ? null : p.annualized_return_pct) },
  { key: "current_price", label: "Current Price", right: true, csv: "Current Price ($)", csvValue: (p) => p.current_price },
  { key: "avg_cost", label: "Average Cost", right: true, csv: "Average Cost ($)", csvValue: (p) => p.avg_cost },
  { key: "current_weight", label: "Current Weight", right: true, csv: "Current Weight (decimal)", csvValue: (p) => p.current_weight },
  { key: "target_weight", label: "Target Weight", right: true, csv: "Target Weight (decimal)", csvValue: (p) => p.target_weight },
  { key: "intrinsic_value", label: "Intrinsic Value", right: true, csv: "Intrinsic Value Estimate ($)", csvValue: (p) => p.intrinsic_value },
  { key: "v_over_p", label: "V/P", right: true, csv: "V/P", csvValue: (p) => p.v_over_p },
  { key: "unrealized_pnl", label: "Unrealized P/L", right: true, csv: "Unrealized P/L ($)", csvValue: (p) => p.unrealized_pnl },
  { key: "current_size", label: "Current Size", right: true, csv: "Current Size ($)", csvValue: (p) => p.current_size },
  { key: "current_quantity", label: "Qty", right: true, csv: "Current Quantity", csvValue: (p) => p.current_quantity },
  { key: "initial_purchase", label: "Initial Purchase", right: true, csv: "Initial Purchase", csvValue: (p) => p.initial_purchase },
  { key: "committee", label: "Committee", csv: "Committee", csvValue: (p) => p.committee?.name ?? null },
];

export function PositionsTable({ positions }: { positions: PositionRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => sortRows(positions, sortKey, sortDir), [positions, sortKey, sortDir]);

  function onHeaderClick(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const build = () => ({
    headers: COLUMNS.map((c) => c.csv),
    rows: sorted.map((p) => COLUMNS.map((c) => c.csvValue(p))),
  });

  if (positions.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm text-gray-400 dark:text-gray-500 shadow-sm">
        No open positions yet.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {sorted.length} holdings · click any column to sort
        </p>
        <ExportButton filename="positions.csv" build={build} />
      </div>
      <div className="scroll-hint overflow-x-auto rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-800 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm text-left text-[11px] uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
            <tr>
              {COLUMNS.map((c) => (
                <SortableTh
                  key={c.key}
                  active={sortKey === c.key}
                  direction={sortKey === c.key ? sortDir : null}
                  right={c.right}
                  onClick={() => onHeaderClick(c.key)}
                >
                  {c.label}
                </SortableTh>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {sorted.map((p) => (
              <tr
                key={p.ticker}
                className="transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/40"
              >
                <Td strong>{p.name}</Td>
                <Td strong>
                  <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-gray-700 dark:text-gray-300">
                    {p.ticker}
                  </span>
                </Td>
                <TdPct value={p.day_change_pct} />
                <TdPct value={p.week_change_pct} />
                <TdPct value={p.month_change_pct} />
                <TdPct value={p.since_last_update_pct} />
                <TdPct value={p.total_return_pct} />
                <Td right tone={p.annualized_return_pct}>
                  {p.held_less_than_one_year
                    ? <span className="text-gray-400 dark:text-gray-500">&lt;1Yr</span>
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
                <Td>
                  {p.committee ? (
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: p.committee.color ?? "#9ca3af" }}
                        aria-hidden
                      />
                      <span>{p.committee.name}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sortRows(rows: PositionRow[], key: SortKey, dir: SortDir): PositionRow[] {
  const copy = [...rows];
  const mult = dir === "asc" ? 1 : -1;

  copy.sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);

    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;

    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * mult;
    }
    return String(av).localeCompare(String(bv)) * mult;
  });

  return copy;
}

function sortValue(p: PositionRow, key: SortKey): string | number | null {
  switch (key) {
    case "name": return p.name;
    case "ticker": return p.ticker;
    case "day_change_pct": return p.day_change_pct;
    case "week_change_pct": return p.week_change_pct;
    case "month_change_pct": return p.month_change_pct;
    case "since_last_update_pct": return p.since_last_update_pct;
    case "total_return_pct": return p.total_return_pct;
    case "annualized_return_pct":
      return p.held_less_than_one_year ? null : p.annualized_return_pct;
    case "current_price": return p.current_price;
    case "avg_cost": return p.avg_cost;
    case "current_weight": return p.current_weight;
    case "target_weight": return p.target_weight;
    case "intrinsic_value": return p.intrinsic_value;
    case "v_over_p": return p.v_over_p;
    case "unrealized_pnl": return p.unrealized_pnl;
    case "current_size": return p.current_size;
    case "current_quantity": return p.current_quantity;
    case "initial_purchase": return p.initial_purchase;
    case "committee": return p.committee?.name ?? null;
  }
}

function SortableTh({
  children,
  active,
  direction,
  right,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  direction: SortDir | null;
  right?: boolean;
  onClick: () => void;
}) {
  const arrow = active ? (direction === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      className={`whitespace-nowrap px-3 py-2.5 font-medium select-none ${right ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`w-full ${right ? "text-right" : "text-left"} transition-colors ${
          active ? "text-gray-900 dark:text-gray-100" : "hover:text-gray-900 dark:hover:text-gray-100"
        }`}
      >
        {children}
        <span className="tabular-nums">{arrow}</span>
      </button>
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
  const glyph =
    value === null || value === 0
      ? ""
      : value > 0
        ? "▲ "
        : "▼ ";
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${toneClass(value)}`}
    >
      {value === null ? "—" : (
        <>
          <span className="text-[10px] opacity-70">{glyph}</span>
          {fmtPctSigned(value)}
        </>
      )}
    </td>
  );
}

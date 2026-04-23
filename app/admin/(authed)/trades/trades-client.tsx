"use client";

import { useMemo, useState } from "react";
import {
  fmtCurrency,
  fmtDateShort,
  fmtInteger,
  fmtSignedCurrency,
} from "@/components/format";

type LogRow = {
  kind: "buy" | "sell";
  date: string;
  ticker: string;
  name: string | null;
  committee: { id: string; name: string; color: string | null } | null;
  shares: number;
  price: number;
  amount: number;
  note: string | null;
};

export function TradesClient({ rows }: { rows: LogRow[] }) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "buy" | "sell">("all");
  const [committeeFilter, setCommitteeFilter] = useState<string>("all");

  const committeeOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const r of rows) {
      if (r.committee) byId.set(r.committee.id, { id: r.committee.id, name: r.committee.name });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return rows.filter((r) => {
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (committeeFilter !== "all" && r.committee?.id !== committeeFilter)
        return false;
      if (q && !r.ticker.includes(q) && !(r.name ?? "").toUpperCase().includes(q))
        return false;
      return true;
    });
  }, [rows, query, kindFilter, committeeFilter]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by ticker or name"
          className="flex-1 min-w-48 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700"
        />
        <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
          {(["all", "buy", "sell"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-all ${
                kindFilter === k
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              {k === "all" ? "All" : k}
            </button>
          ))}
        </div>
        <select
          value={committeeFilter}
          onChange={(e) => setCommitteeFilter(e.target.value)}
          className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700"
        >
          <option value="all">All Committees</option>
          {committeeOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-left text-[11px] uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Kind</th>
              <th className="px-4 py-2 font-medium">Ticker</th>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Committee</th>
              <th className="px-4 py-2 text-right font-medium">Shares</th>
              <th className="px-4 py-2 text-right font-medium">Price</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500"
                >
                  No trades match.
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={`${r.date}-${r.ticker}-${r.kind}-${i}`} className="transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                    {fmtDateShort(r.date)}
                  </td>
                  <td className="px-4 py-2">
                    <KindBadge kind={r.kind} />
                  </td>
                  <td className="px-4 py-2">
                    <a
                      href={`/positions/${encodeURIComponent(r.ticker)}`}
                      className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-gray-700 dark:text-gray-300 transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-950 hover:text-indigo-700 dark:hover:text-indigo-300"
                    >
                      {r.ticker}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                    {r.name ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {r.committee ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: r.committee.color ?? "#9ca3af" }}
                          aria-hidden
                        />
                        <span className="text-gray-700 dark:text-gray-300">
                          {r.committee.name}
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmtInteger(r.shares)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmtCurrency(r.price)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${r.amount >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                    {fmtSignedCurrency(r.amount)}
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 max-w-sm truncate" title={r.note ?? ""}>
                    {r.note ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {filtered.length} of {rows.length} rows
      </p>
    </>
  );
}

function KindBadge({ kind }: { kind: "buy" | "sell" }) {
  const cls =
    kind === "buy"
      ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
      : "bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${cls}`}>
      {kind}
    </span>
  );
}

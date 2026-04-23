"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtCurrency, fmtNumber, fmtPctPlain } from "@/components/format";

export type TickerMetaRow = {
  ticker: string;
  name: string;
  committee: { id: string; name: string; color: string | null } | null;
  current_price: number | null;
  target_weight: number | null;
  intrinsic_value: number | null;
  v_over_p: number | null;
  value_updated_at: string | null; // YYYY-MM-DD or null
};

export function TickersClient({ rows }: { rows: TickerMetaRow[] }) {
  // Sum of currently-persisted target_weight. We show it in the totals
  // row so the PM can tell at a glance whether the book's target
  // allocation sums to 100%. The sum updates optimistically as rows
  // save — we re-derive from `rows` on every router.refresh().
  const totalTargetWeight = useMemo(
    () =>
      rows.reduce((sum, r) => sum + (r.target_weight ?? 0), 0),
    [rows],
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm text-gray-400 dark:text-gray-500 shadow-sm">
        No open positions yet.
      </div>
    );
  }

  const totalStatus = summarizeTargetWeightTotal(totalTargetWeight);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {rows.length} holdings
        </p>
        <p
          className={`text-xs tabular-nums ${totalStatus.tone}`}
          title="Sum of target weights across all held tickers"
        >
          Target Weight Sum: {fmtPctPlain(totalTargetWeight, 2)} {totalStatus.glyph}
        </p>
      </div>
      <div className="scroll-hint overflow-x-auto rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-800 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm text-left text-[11px] uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
            <tr>
              <Th>Ticker</Th>
              <Th>Company</Th>
              <Th>Committee</Th>
              <Th right>Current Price</Th>
              <Th right>Target Weight</Th>
              <Th right>Intrinsic Value</Th>
              <Th right>V/P</Th>
              <Th>Last Updated</Th>
              <Th right>Save</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((r) => (
              <EditableRow key={r.ticker} row={r} />
            ))}
          </tbody>
          <tfoot className="border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
            <tr>
              <td
                className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400"
                colSpan={4}
              >
                Totals
              </td>
              <td
                className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums font-medium ${totalStatus.tone}`}
              >
                {fmtPctPlain(totalTargetWeight, 2)} {totalStatus.glyph}
              </td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function EditableRow({ row }: { row: TickerMetaRow }) {
  const router = useRouter();
  // Initial strings mirror what's in the DB. "dirty" means the user
  // edited a field; only dirty fields get shipped so we don't
  // accidentally clobber something another PM changed in the meantime.
  const initialTargetWeight =
    row.target_weight === null ? "" : (row.target_weight * 100).toString();
  const initialIntrinsicValue =
    row.intrinsic_value === null ? "" : row.intrinsic_value.toString();
  const initialValueUpdatedAt = row.value_updated_at ?? "";

  const [targetWeight, setTargetWeight] = useState(initialTargetWeight);
  const [intrinsicValue, setIntrinsicValue] = useState(initialIntrinsicValue);
  const [valueUpdatedAt, setValueUpdatedAt] = useState(initialValueUpdatedAt);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Live V/P preview — recompute from the draft intrinsic value so the
  // analyst can see it change before they save.
  const draftIntrinsic = parseMoney(intrinsicValue);
  const livePrice = row.current_price;
  const liveVOverP =
    draftIntrinsic.kind !== "number" ||
    livePrice === null ||
    livePrice === 0
      ? row.v_over_p
      : draftIntrinsic.value / livePrice;

  function setToToday() {
    const today = new Date().toISOString().slice(0, 10);
    setValueUpdatedAt(today);
    if (status === "saved") setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    setError(null);

    const body: Record<string, unknown> = { ticker: row.ticker };

    if (targetWeight !== initialTargetWeight) {
      const parsed = parsePercent(targetWeight);
      if (parsed.kind === "invalid") {
        setError("target weight must be a number");
        setStatus("error");
        return;
      }
      if (parsed.kind === "number" && (parsed.value < 0 || parsed.value > 100)) {
        setError("target weight 0–100%");
        setStatus("error");
        return;
      }
      body.target_weight = parsed.kind === "empty" ? null : parsed.value / 100;
    }

    if (intrinsicValue !== initialIntrinsicValue) {
      const parsed = parseMoney(intrinsicValue);
      if (parsed.kind === "invalid") {
        setError("intrinsic value must be a number");
        setStatus("error");
        return;
      }
      if (parsed.kind === "number" && parsed.value < 0) {
        setError("intrinsic ≥ 0");
        setStatus("error");
        return;
      }
      body.intrinsic_value = parsed.kind === "empty" ? null : parsed.value;
    }

    if (valueUpdatedAt !== initialValueUpdatedAt) {
      body.value_updated_at = valueUpdatedAt === "" ? null : valueUpdatedAt;
    }

    // Only ticker in the body → nothing changed. Surface that rather
    // than firing a no-op request.
    if (Object.keys(body).length === 1) {
      setStatus("idle");
      return;
    }

    const res = await fetch("/api/admin/ticker-meta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(
        typeof payload.message === "string"
          ? payload.message
          : typeof payload.error === "string"
            ? payload.error
            : `HTTP ${res.status}`,
      );
      setStatus("error");
      return;
    }
    setStatus("saved");
    router.refresh();
  }

  function markDirty() {
    if (status === "saved" || status === "error") setStatus("idle");
  }

  return (
    <tr className="transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/40">
      <td className="whitespace-nowrap px-3 py-2">
        <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-gray-700 dark:text-gray-300">
          {row.ticker}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
        {row.name}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-300">
        {row.committee ? (
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: row.committee.color ?? "#9ca3af" }}
              aria-hidden
            />
            <span>{row.committee.name}</span>
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
        {fmtCurrency(row.current_price)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="inline-flex items-center gap-1">
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            inputMode="decimal"
            value={targetWeight}
            onChange={(e) => {
              setTargetWeight(e.target.value);
              markDirty();
            }}
            placeholder="—"
            className="w-20 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-1.5 py-0.5 text-right tabular-nums text-gray-900 dark:text-gray-100"
          />
          <span className="text-xs text-gray-400 dark:text-gray-500">%</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="inline-flex items-center gap-1">
          <span className="text-xs text-gray-400 dark:text-gray-500">$</span>
          <input
            type="number"
            step="0.0001"
            min="0"
            inputMode="decimal"
            value={intrinsicValue}
            onChange={(e) => {
              setIntrinsicValue(e.target.value);
              markDirty();
            }}
            placeholder="—"
            className="w-28 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-1.5 py-0.5 text-right tabular-nums text-gray-900 dark:text-gray-100"
          />
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
        {fmtNumber(liveVOverP, 2)}
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <div className="inline-flex items-center gap-1">
          <input
            type="date"
            value={valueUpdatedAt}
            onChange={(e) => {
              setValueUpdatedAt(e.target.value);
              markDirty();
            }}
            className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-1.5 py-0.5 text-gray-900 dark:text-gray-100"
          />
          <button
            type="button"
            onClick={setToToday}
            className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-0.5 text-[11px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Set to today"
          >
            Today
          </button>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="inline-flex items-center gap-2">
          {error && (
            <span className="text-[11px] text-red-600 dark:text-red-400">
              {error}
            </span>
          )}
          {status === "saved" && !error && (
            <span className="text-[11px] text-green-600 dark:text-green-500">
              Saved
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={status === "saving"}
            className="rounded-md bg-gray-900 dark:bg-gray-100 px-2.5 py-1 text-xs font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
          >
            {status === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </td>
    </tr>
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
    <th
      className={`whitespace-nowrap px-3 py-2.5 font-medium select-none ${right ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

type ParsedInput =
  | { kind: "empty" }
  | { kind: "number"; value: number }
  | { kind: "invalid" };

function parseMoney(raw: string): ParsedInput {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "empty" };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { kind: "invalid" };
  return { kind: "number", value: n };
}

function parsePercent(raw: string): ParsedInput {
  return parseMoney(raw);
}

function summarizeTargetWeightTotal(total: number): {
  tone: string;
  glyph: string;
} {
  // Perfect 1.0 (within rounding) is green. Off by <5 percentage points
  // is amber so the PM can see it's close but not set. Anything further
  // is red.
  const diff = Math.abs(total - 1);
  if (diff < 0.0005) {
    return { tone: "text-green-600 dark:text-green-500", glyph: "✓" };
  }
  if (diff < 0.05) {
    return { tone: "text-amber-600 dark:text-amber-500", glyph: "●" };
  }
  return { tone: "text-red-600 dark:text-red-500", glyph: "!" };
}

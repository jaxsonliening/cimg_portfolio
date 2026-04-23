"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CashTxKind =
  | "deposit"
  | "capital_injection"
  | "withdrawal"
  | "dividend"
  | "fee"
  | "adjustment"
  | "trade_buy"
  | "trade_sell";

export type CashTx = {
  id: string;
  amount: number;
  kind: CashTxKind;
  ticker: string | null;
  occurred_at: string;
  note: string | null;
};

export function RecentList({
  transactions,
  tickers,
}: {
  transactions: CashTx[];
  tickers: string[];
}) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
        No cash transactions yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="px-3 py-2 font-medium">Ticker</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Note</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {transactions.map((t) => (
            <TxRow key={t.id} tx={t} tickers={tickers} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TxRow({ tx, tickers }: { tx: CashTx; tickers: string[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sign semantics are fixed by kind. The edit form exposes the magnitude
  // and we re-apply the sign on save to match the create-path's behavior.
  const signOf = signForKind(tx.kind);
  const initialMagnitude =
    signOf === "fixed-sign" ? Math.abs(tx.amount).toString() : tx.amount.toString();

  const [amount, setAmount] = useState(initialMagnitude);
  const [occurredAt, setOccurredAt] = useState(tx.occurred_at);
  const [note, setNote] = useState(tx.note ?? "");
  const [ticker, setTicker] = useState(tx.ticker ?? "");

  const isDividend = tx.kind === "dividend";
  const canDelete = tx.kind !== "trade_buy" && tx.kind !== "trade_sell";

  function resetAndClose() {
    setAmount(initialMagnitude);
    setOccurredAt(tx.occurred_at);
    setNote(tx.note ?? "");
    setTicker(tx.ticker ?? "");
    setError(null);
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    setError(null);

    let signedAmount = Number(amount);
    if (!Number.isFinite(signedAmount)) {
      setError("amount must be a number");
      setSaving(false);
      return;
    }
    if (tx.kind === "withdrawal" || tx.kind === "fee") {
      signedAmount = -Math.abs(signedAmount);
    } else if (
      tx.kind === "deposit" ||
      tx.kind === "capital_injection" ||
      tx.kind === "dividend"
    ) {
      signedAmount = Math.abs(signedAmount);
    }

    const body: Record<string, unknown> = {
      id: tx.id,
      amount: signedAmount,
      occurred_at: occurredAt,
      note: note.trim() === "" ? null : note.trim(),
    };
    if (isDividend) {
      body.ticker = ticker.trim() === "" ? null : ticker.trim().toUpperCase();
    }

    const res = await fetch("/api/admin/cash", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const respBody = await res.json().catch(() => ({}));
      const detail =
        respBody.issues?.[0]?.message ??
        respBody.message ??
        respBody.error ??
        `HTTP ${res.status}`;
      setError(detail);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete this ${fmt(tx.amount)} ${tx.kind.replace("_", " ")}?`)) {
      return;
    }
    setRemoving(true);
    setError(null);
    const res = await fetch(`/api/admin/cash?id=${encodeURIComponent(tx.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const respBody = await res.json().catch(() => ({}));
      setError(respBody.error ?? `HTTP ${res.status}`);
      setRemoving(false);
      return;
    }
    setRemoving(false);
    router.refresh();
  }

  if (editing) {
    return (
      <tr className="bg-gray-50 dark:bg-gray-800/40">
        <td className="px-3 py-2" colSpan={6}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Amount{" "}
                <span className="text-gray-400 dark:text-gray-500">
                  ({signSymbol(tx.kind)})
                </span>
              </span>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-right text-sm tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Date
              </span>
              <input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
              />
            </label>
            {isDividend ? (
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Ticker
                </span>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  list={`ticker-list-${tx.id}`}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm uppercase"
                />
                <datalist id={`ticker-list-${tx.id}`}>
                  {tickers.map((sym) => (
                    <option key={sym} value={sym} />
                  ))}
                </datalist>
              </label>
            ) : (
              <div className="hidden md:block" />
            )}
            <label className="block md:col-span-1">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Note
              </span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional"
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
              />
            </label>
          </div>
          {error && (
            <div className="mt-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-900 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetAndClose}
              disabled={saving}
              className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-gray-900 dark:bg-gray-100 px-2.5 py-1 text-xs font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
      <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">
        {tx.occurred_at}
      </td>
      <td className="px-3 py-1.5">
        <KindBadge kind={tx.kind} />
      </td>
      <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">
        {tx.ticker ?? "—"}
      </td>
      <td
        className={`px-3 py-1.5 text-right tabular-nums ${
          tx.amount >= 0 ? "text-green-700" : "text-red-700"
        }`}
      >
        {fmtSigned(tx.amount)}
      </td>
      <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">
        {tx.note ?? ""}
      </td>
      <td className="px-3 py-1.5 text-right">
        <div className="flex items-center justify-end gap-2">
          {error && (
            <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={removing}
            className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Edit
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={remove}
              disabled={removing}
              className="rounded-md border border-red-200 dark:border-red-900 bg-white dark:bg-gray-900 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function KindBadge({ kind }: { kind: CashTxKind }) {
  const palette: Record<CashTxKind, string> = {
    deposit: "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300",
    capital_injection:
      "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300",
    withdrawal: "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300",
    dividend: "bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300",
    trade_buy: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
    trade_sell: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
    fee: "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300",
    adjustment:
      "bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${palette[kind]}`}
    >
      {kind}
    </span>
  );
}

function signForKind(kind: CashTxKind): "fixed-sign" | "free" {
  if (kind === "adjustment") return "free";
  return "fixed-sign";
}

function signSymbol(kind: CashTxKind): "+" | "-" | "±" {
  if (kind === "withdrawal" || kind === "fee" || kind === "trade_buy") return "-";
  if (kind === "adjustment") return "±";
  return "+";
}

function fmt(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtSigned(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

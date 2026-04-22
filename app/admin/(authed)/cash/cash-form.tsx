"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

type Kind = "deposit" | "dividend" | "withdrawal" | "fee" | "adjustment";

const KINDS: { value: Kind; label: string; hint: string; sign: "+" | "-" | "±" }[] = [
  { value: "deposit", label: "Deposit", hint: "Cash contributed to the fund.", sign: "+" },
  { value: "dividend", label: "Dividend", hint: "Paid by a held stock. Ticker required.", sign: "+" },
  { value: "withdrawal", label: "Withdrawal", hint: "Cash leaving the fund.", sign: "-" },
  { value: "fee", label: "Fee", hint: "Broker or platform fee.", sign: "-" },
  { value: "adjustment", label: "Adjustment", hint: "Manual correction. Can be + or −.", sign: "±" },
];

export function CashForm({ tickers }: { tickers: string[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("deposit");
  const [amount, setAmount] = useState("");
  const [ticker, setTicker] = useState("");
  const [occurredAt, setOccurredAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  const meta = useMemo(() => KINDS.find((k) => k.value === kind)!, [kind]);
  const needsTicker = kind === "dividend";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    // Normalize the sign: form always takes the magnitude; we apply the
    // right sign based on kind. Adjustments pass through as typed.
    let signedAmount = Number(amount);
    if (kind === "withdrawal" || kind === "fee") {
      signedAmount = -Math.abs(signedAmount);
    } else if (kind === "deposit" || kind === "dividend") {
      signedAmount = Math.abs(signedAmount);
    }

    const res = await fetch("/api/admin/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        amount: signedAmount,
        ticker: needsTicker ? ticker || undefined : undefined,
        occurred_at: occurredAt,
        note: note.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail =
        body.issues?.[0]?.message ??
        body.message ??
        body.error ??
        `HTTP ${res.status}`;
      setError(detail);
      setStatus("idle");
      return;
    }
    setAmount("");
    setNote("");
    router.refresh();
    setStatus("idle");
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
      <div className="flex flex-wrap gap-1">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setKind(k.value)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              kind === k.value
                ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                : "border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{meta.hint}</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Amount <span className="text-gray-400 dark:text-gray-500">({meta.sign})</span>
          </span>
          <input
            type="number"
            required
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={kind === "adjustment" ? "± amount" : "amount"}
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-sm tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Date</span>
          <input
            type="date"
            required
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {needsTicker && (
        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Ticker</span>
          <input
            type="text"
            required
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            list="ticker-list"
            placeholder="AAPL"
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm uppercase"
          />
          <datalist id="ticker-list">
            {tickers.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      )}

      <label className="block">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Note</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional"
          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm"
        />
      </label>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-md bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Log transaction"}
        </button>
      </div>
    </form>
  );
}

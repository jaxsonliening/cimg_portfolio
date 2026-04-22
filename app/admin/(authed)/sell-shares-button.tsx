"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SellSharesButton({
  ticker,
  maxShares,
}: {
  ticker: string;
  maxShares: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState(String(maxShares));
  const [price, setPrice] = useState("");
  const [tradedAt, setTradedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        Sell…
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    const res = await fetch("/api/admin/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        shares,
        price,
        traded_at: tradedAt,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? body.error ?? `HTTP ${res.status}`);
      setStatus("idle");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 text-xs">
      <input
        type="number"
        step="0.0001"
        min="0.0001"
        max={maxShares}
        value={shares}
        onChange={(e) => setShares(e.target.value)}
        required
        className="w-20 rounded border border-gray-300 dark:border-gray-700 px-1.5 py-0.5 text-right tabular-nums"
        title={`Max ${maxShares}`}
      />
      <span className="text-gray-400 dark:text-gray-500">@</span>
      <input
        type="number"
        step="0.0001"
        min="0"
        placeholder="price"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        required
        className="w-24 rounded border border-gray-300 dark:border-gray-700 px-1.5 py-0.5 text-right tabular-nums"
      />
      <input
        type="date"
        value={tradedAt}
        onChange={(e) => setTradedAt(e.target.value)}
        required
        className="rounded border border-gray-300 dark:border-gray-700 px-1.5 py-0.5"
      />
      <button
        type="submit"
        disabled={status === "saving"}
        className="rounded-md bg-gray-900 dark:bg-gray-100 px-2 py-0.5 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
      >
        {status === "saving" ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-gray-500 dark:text-gray-400 hover:text-gray-700"
      >
        Cancel
      </button>
      {error && <span className="w-full text-red-600">{error}</span>}
    </form>
  );
}

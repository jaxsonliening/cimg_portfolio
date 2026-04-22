"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Committee = { id: string; name: string };

export function AddPositionForm({ committees }: { committees: Committee[] }) {
  const router = useRouter();

  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [committeeId, setCommitteeId] = useState(committees[0]?.id ?? "");
  const [shares, setShares] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [thesis, setThesis] = useState("");

  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    const res = await fetch("/api/admin/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        name,
        committee_id: committeeId,
        shares,
        cost_basis: costBasis,
        purchased_at: purchasedAt,
        thesis: thesis.trim() || undefined,
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

    router.push("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Ticker" hint="e.g. AAPL">
          <input
            type="text"
            required
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm uppercase tracking-wide"
            placeholder="AAPL"
            autoComplete="off"
          />
        </Field>
        <Field label="Company name">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm"
            placeholder="Apple Inc."
          />
        </Field>
        <Field label="Committee">
          <select
            required
            value={committeeId}
            onChange={(e) => setCommitteeId(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          >
            {committees.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Purchase date">
          <input
            type="date"
            required
            value={purchasedAt}
            onChange={(e) => setPurchasedAt(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Shares">
          <input
            type="number"
            required
            step="0.0001"
            min="0.0001"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-sm tabular-nums"
          />
        </Field>
        <Field label="Cost basis (per share)">
          <input
            type="number"
            required
            step="0.0001"
            min="0"
            value={costBasis}
            onChange={(e) => setCostBasis(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-sm tabular-nums"
          />
        </Field>
      </div>

      <Field label="Thesis" hint="Optional — why we bought this.">
        <textarea
          rows={3}
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          className="w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm"
        />
      </Field>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-md bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Add position"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {hint && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

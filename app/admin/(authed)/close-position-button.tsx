"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClosePositionButton({
  id,
  ticker,
}: {
  id: string;
  ticker: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closedAt, setClosedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [closePrice, setClosePrice] = useState("");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50"
      >
        Close…
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    const res = await fetch(`/api/admin/positions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closed_at: closedAt, close_price: closePrice }),
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
    <form onSubmit={submit} className="flex items-center gap-2 text-xs">
      <span className="text-gray-500">{ticker}</span>
      <input
        type="date"
        value={closedAt}
        onChange={(e) => setClosedAt(e.target.value)}
        required
        className="rounded border border-gray-300 px-1.5 py-0.5"
      />
      <input
        type="number"
        step="0.0001"
        min="0"
        placeholder="close px"
        value={closePrice}
        onChange={(e) => setClosePrice(e.target.value)}
        required
        className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-right tabular-nums"
      />
      <button
        type="submit"
        disabled={status === "saving"}
        className="rounded-md bg-gray-900 px-2 py-0.5 text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {status === "saving" ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-gray-500 hover:text-gray-700"
      >
        Cancel
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </form>
  );
}

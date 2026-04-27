"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDateShort } from "@/components/format";

export function LastUpdateBanner({
  lastUpdate,
}: {
  lastUpdate: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(lastUpdate ?? todayIso());
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    const res = await fetch("/api/admin/last-update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? body.error ?? `HTTP ${res.status}`);
      setStatus("idle");
      return;
    }
    setStatus("idle");
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="text-sm text-gray-500 dark:text-gray-400">
      Last analyst update:{" "}
      {editing ? (
        <form onSubmit={save} className="inline-flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-1.5 py-0.5 text-xs"
          />
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded-md bg-gray-900 dark:bg-gray-100 px-2 py-0.5 text-xs text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
          >
            {status === "saving" ? "…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDate(lastUpdate ?? todayIso());
              setError(null);
            }}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700"
          >
            Cancel
          </button>
          {error && (
            <span className="text-xs text-red-600 dark:text-red-400">
              {error}
            </span>
          )}
        </form>
      ) : (
        <>
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {fmtDateShort(lastUpdate)}
          </span>{" "}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            edit
          </button>
        </>
      )}
    </div>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

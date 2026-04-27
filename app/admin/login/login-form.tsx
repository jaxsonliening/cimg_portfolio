"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");

  const unauthorized = params.get("unauthorized") === "1";
  const callbackFailed = params.get("error") === "1";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);

    const res = await fetch("/api/auth/email-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      delivery?: "email";
      error?: string;
    };

    if (!res.ok || !body.ok || body.delivery !== "email") {
      setErrorMsg(body.error ?? "Something went wrong. Try again.");
      setStatus("idle");
      return;
    }

    setSentTo(email);
    setStatus("sent");
  }

  return (
    <main className="mx-auto mt-16 max-w-md p-6">
      <Link
        href="/"
        className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-gray-100"
      >
        ← Back to Portfolio
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Admin Sign In</h1>

      {unauthorized && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Your account is not an admin.
        </div>
      )}
      {callbackFailed && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          That link expired. Request a new one.
        </div>
      )}

      {status === "sent" ? (
        <div className="mt-6 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          Check <strong>{sentTo}</strong> for a sign-in link.
          <p className="mt-2 text-xs text-green-800/80">
            Email delivery can take up to 5 minutes. If it hasn&apos;t arrived
            by then, check your spam folder or request another link.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none"
              placeholder="pm@example.com"
              autoComplete="email"
            />
          </label>
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-md bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
          >
            {status === "sending" ? "Sending…" : "Send Magic Link"}
          </button>
          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        </form>
      )}
    </main>
  );
}

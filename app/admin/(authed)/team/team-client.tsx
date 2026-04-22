"use client";

import { useEffect, useState } from "react";

type Member = {
  user_id: string;
  email: string | null;
  role: "admin" | "viewer";
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

export function TeamClient() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/users", { cache: "no-store" });
    const body = await r.json();
    if (!r.ok) {
      setError(body.error ?? "failed to load");
    } else {
      setMembers(body.users);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-8">
      <InviteCard onInvited={load} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Members ({members.length})
        </h2>
        {loading ? (
          <Empty>Loading…</Empty>
        ) : error ? (
          <Empty>{error}</Empty>
        ) : members.length === 0 ? (
          <Empty>No users yet.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Last Sign-In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {members.map((m) => (
                  <MemberRow key={m.user_id} member={m} onChange={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MemberRow({
  member,
  onChange,
}: {
  member: Member;
  onChange: () => void;
}) {
  const [role, setRole] = useState(member.role);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(next: "admin" | "viewer") {
    setSaving(true);
    setMsg(null);
    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: member.user_id, role: next }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      setMsg(body.error ?? `${r.status}`);
      setRole(member.role);
    } else {
      setRole(next);
      onChange();
    }
    setSaving(false);
  }

  return (
    <tr>
      <td className="px-4 py-2">
        <div className="font-medium">{member.email ?? "—"}</div>
        {member.display_name && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {member.display_name}
          </div>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <select
            value={role}
            disabled={saving}
            onChange={(e) => save(e.target.value as "admin" | "viewer")}
            className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
          >
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
          {msg && <span className="text-xs text-red-600">{msg}</span>}
        </div>
      </td>
      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
        {member.last_sign_in_at
          ? new Date(member.last_sign_in_at).toLocaleDateString()
          : "never"}
      </td>
    </tr>
  );
}

function InviteCard({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setUrl(null);
    const r = await fetch("/api/admin/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const body = await r.json();
    if (!r.ok) {
      setError(body.error ?? "failed");
    } else {
      setUrl(body.url);
      setEmail("");
      onInvited();
    }
    setSending(false);
  }

  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Invite Someone
      </h2>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-64">
          <span className="text-xs text-gray-500 dark:text-gray-400">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="newpm@crimson.ua.edu"
            className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="text-xs text-gray-500 dark:text-gray-400">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "viewer")}
            className="mt-1 block rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          >
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
        >
          {sending ? "Generating…" : "Generate Sign-In Link"}
        </button>
      </form>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      {url && <InviteLink url={url} />}
    </section>
  );
}

function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
      <div className="mb-1 font-medium text-green-900">
        Sign-in link ready — send it to them directly.
      </div>
      <div className="flex items-start gap-2">
        <code className="block flex-1 break-all rounded bg-white px-2 py-1 text-xs text-gray-800">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="mt-2 text-xs text-green-800">
        Valid for ~1 hour. They&apos;ll land on /admin signed in.
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
      {children}
    </div>
  );
}

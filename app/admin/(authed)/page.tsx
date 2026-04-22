import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ClosePositionButton } from "./close-position-button";

export default async function AdminHome() {
  const supabase = await createClient();

  const [positionsRes, committeesRes] = await Promise.all([
    supabase
      .from("positions")
      .select(
        "id, ticker, name, committee_id, shares, cost_basis, purchased_at, closed_at, close_price",
      )
      .order("closed_at", { ascending: true, nullsFirst: true })
      .order("purchased_at", { ascending: false }),
    supabase.from("committees").select("id, name"),
  ]);

  const positions = positionsRes.data ?? [];
  const committeesById = new Map(
    (committeesRes.data ?? []).map((c) => [c.id, c.name]),
  );

  const open = positions.filter((p) => p.closed_at === null);
  const closed = positions.filter((p) => p.closed_at !== null);

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio admin</h1>
          <p className="mt-1 text-sm text-gray-500">
            Add or close positions. Changes propagate to the public dashboard and API on the next tick.
          </p>
        </div>
        <Link
          href="/admin/positions/new"
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add position
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Open positions ({open.length})
        </h2>
        {open.length === 0 ? (
          <EmptyHint>No open positions yet. Click <em>Add position</em> to log the first one.</EmptyHint>
        ) : (
          <PositionTable
            rows={open}
            committeesById={committeesById}
            closable
          />
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Closed positions ({closed.length})
          </h2>
          <PositionTable rows={closed} committeesById={committeesById} closable={false} />
        </section>
      )}
    </div>
  );
}

type PositionRow = {
  id: string;
  ticker: string;
  name: string;
  committee_id: string;
  shares: number;
  cost_basis: number;
  purchased_at: string;
  closed_at: string | null;
  close_price: number | null;
};

function PositionTable({
  rows,
  committeesById,
  closable,
}: {
  rows: PositionRow[];
  committeesById: Map<string, string>;
  closable: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2 font-medium">Ticker</th>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Committee</th>
            <th className="px-4 py-2 text-right font-medium">Shares</th>
            <th className="px-4 py-2 text-right font-medium">Cost basis</th>
            <th className="px-4 py-2 font-medium">Purchased</th>
            {closable ? (
              <th className="px-4 py-2 font-medium">Close</th>
            ) : (
              <>
                <th className="px-4 py-2 font-medium">Closed</th>
                <th className="px-4 py-2 text-right font-medium">Close price</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-2 font-medium">{p.ticker}</td>
              <td className="px-4 py-2 text-gray-700">{p.name}</td>
              <td className="px-4 py-2 text-gray-700">
                {committeesById.get(p.committee_id) ?? p.committee_id}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{p.shares}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                ${p.cost_basis.toFixed(2)}
              </td>
              <td className="px-4 py-2 text-gray-700">{p.purchased_at}</td>
              {closable ? (
                <td className="px-4 py-2">
                  <ClosePositionButton id={p.id} ticker={p.ticker} />
                </td>
              ) : (
                <>
                  <td className="px-4 py-2 text-gray-700">{p.closed_at}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {p.close_price !== null ? `$${p.close_price.toFixed(2)}` : "—"}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
      {children}
    </div>
  );
}

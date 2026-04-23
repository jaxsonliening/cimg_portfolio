import { createClient } from "@/lib/supabase/server";
import { TradesClient } from "./trades-client";

export const dynamic = "force-dynamic";

// Unified trade log: every buy (from public.positions, each row a
// lot) and every sell (from public.trades). Combined into one list
// for committee-accountability purposes so the PM doesn't have to
// cross-reference two tables to see what happened in a given month.

type LogRow = {
  kind: "buy" | "sell";
  date: string;
  ticker: string;
  name: string | null;
  committee: { id: string; name: string; color: string | null } | null;
  shares: number;
  price: number;
  amount: number; // shares × price, sign matches cash flow
  note: string | null;
};

export default async function TradesPage() {
  const supabase = await createClient();

  const [positionsRes, tradesRes, committeesRes] = await Promise.all([
    supabase
      .from("positions")
      .select("ticker, name, committee_id, shares, cost_basis, purchased_at, thesis")
      .order("purchased_at", { ascending: false }),
    supabase
      .from("trades")
      .select("ticker, shares, price, traded_at, note")
      .order("traded_at", { ascending: false }),
    supabase.from("committees").select("id, name, color"),
  ]);

  if (positionsRes.error) throw positionsRes.error;
  if (tradesRes.error) throw tradesRes.error;
  if (committeesRes.error) throw committeesRes.error;

  const committeesById = new Map(
    committeesRes.data.map((c) => [c.id, { id: c.id, name: c.name, color: c.color ?? null }]),
  );
  // Index positions by ticker so sell rows can grab the name + committee.
  const positionByTicker = new Map<
    string,
    { name: string; committee_id: string | null }
  >();
  for (const p of positionsRes.data) {
    if (!positionByTicker.has(p.ticker)) {
      positionByTicker.set(p.ticker, {
        name: p.name,
        committee_id: p.committee_id,
      });
    }
  }

  const rows: LogRow[] = [];
  for (const p of positionsRes.data) {
    rows.push({
      kind: "buy",
      date: p.purchased_at,
      ticker: p.ticker,
      name: p.name,
      committee: p.committee_id ? committeesById.get(p.committee_id) ?? null : null,
      shares: p.shares,
      price: p.cost_basis,
      amount: -(p.shares * p.cost_basis),
      note: p.thesis,
    });
  }
  for (const t of tradesRes.data) {
    const meta = positionByTicker.get(t.ticker);
    rows.push({
      kind: "sell",
      date: t.traded_at,
      ticker: t.ticker,
      name: meta?.name ?? null,
      committee: meta?.committee_id
        ? committeesById.get(meta.committee_id) ?? null
        : null,
      shares: t.shares,
      price: t.price,
      amount: t.shares * t.price,
      note: t.note ?? null,
    });
  }

  // Newest first. Within the same date, sells before buys (more
  // common presentation in P&L reports).
  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.kind !== b.kind) return a.kind === "sell" ? -1 : 1;
    return a.ticker.localeCompare(b.ticker);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Trades</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Every buy and sell since inception, newest first.
        </p>
      </div>
      <TradesClient rows={rows} />
    </div>
  );
}

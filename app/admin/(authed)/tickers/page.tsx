import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPositions } from "@/lib/portfolio/positions";
import { TickersClient, type TickerMetaRow } from "./tickers-client";

export const dynamic = "force-dynamic";

export default async function TickersAdminPage() {
  const supabase = await createClient();
  const positions = await getPositions(supabase);

  // getPositions already filters to held tickers (shares > 0), aggregates
  // lots, and joins committee + meta. We just reshape into the narrower
  // row the editor needs.
  const { data: metaRows } = await supabase
    .from("ticker_meta")
    .select("ticker, value_updated_at");
  const updatedAtByTicker = new Map(
    (metaRows ?? []).map((m) => [
      m.ticker,
      m.value_updated_at ? m.value_updated_at.slice(0, 10) : null,
    ]),
  );

  const rows: TickerMetaRow[] = positions.map((p) => ({
    ticker: p.ticker,
    name: p.name,
    committee: p.committee,
    current_price: p.current_price,
    target_weight: p.target_weight,
    intrinsic_value: p.intrinsic_value,
    v_over_p: p.v_over_p,
    value_updated_at: updatedAtByTicker.get(p.ticker) ?? null,
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ticker Meta</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Set target weight, intrinsic value, and last-reviewed date per
            ticker. Changes save to ticker_meta.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700"
        >
          ← Back to Admin
        </Link>
      </div>

      <TickersClient rows={rows} />
    </div>
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { latestPricesFor } from "@/lib/queries/latest-prices";
import {
  computeCommitteeAllocations,
  type CommitteeAllocation,
} from "@/lib/calc/portfolio";

export async function getCommitteeAllocations(
  supabase: SupabaseClient<Database>,
): Promise<CommitteeAllocation[]> {
  const [committeesRes, positionsRes] = await Promise.all([
    supabase.from("committees").select("id, name, color, display_order"),
    supabase
      .from("positions")
      .select("ticker, committee_id, shares")
      .is("closed_at", null),
  ]);
  if (committeesRes.error) throw committeesRes.error;
  if (positionsRes.error) throw positionsRes.error;

  const tickers = Array.from(
    new Set(positionsRes.data.map((p) => p.ticker)),
  );
  const prices = await latestPricesFor(supabase, tickers);

  const { allocations } = computeCommitteeAllocations(
    committeesRes.data,
    positionsRes.data,
    prices,
  );
  return allocations;
}

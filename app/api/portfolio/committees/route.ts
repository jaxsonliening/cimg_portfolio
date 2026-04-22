import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { latestPricesFor } from "@/lib/queries/latest-prices";
import { computeCommitteeAllocations } from "@/lib/calc/portfolio";

export const revalidate = 60;

export async function GET() {
  const supabase = await createClient();

  const [committeesRes, positionsRes] = await Promise.all([
    supabase
      .from("committees")
      .select("id, name, color, display_order"),
    supabase
      .from("positions")
      .select("ticker, committee_id, shares")
      .is("closed_at", null),
  ]);

  if (committeesRes.error) {
    return NextResponse.json(
      { error: "committees_query_failed", message: committeesRes.error.message },
      { status: 500 },
    );
  }
  if (positionsRes.error) {
    return NextResponse.json(
      { error: "positions_query_failed", message: positionsRes.error.message },
      { status: 500 },
    );
  }

  const committees = committeesRes.data;
  const positions = positionsRes.data;
  const tickers = Array.from(new Set(positions.map((p) => p.ticker)));

  let prices: Map<string, number>;
  try {
    prices = await latestPricesFor(supabase, tickers);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: "price_lookup_failed", message },
      { status: 500 },
    );
  }

  const { allocations } = computeCommitteeAllocations(
    committees,
    positions,
    prices,
  );

  return NextResponse.json(allocations, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

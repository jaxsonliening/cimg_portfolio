import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPositions } from "@/lib/portfolio/positions";

export const revalidate = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();

  const supabase = await createClient();

  let all;
  try {
    all = await getPositions(supabase, { includeClosed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { error: "positions_failed", message },
      { status: 500 },
    );
  }

  const position = all.find((p) => p.ticker === ticker);
  if (!position) {
    return NextResponse.json(
      { error: "unknown_ticker", message: `No position found for ticker ${ticker}` },
      { status: 404 },
    );
  }

  const { data: snapshot } = await supabase
    .from("price_snapshots")
    .select(
      "snapshot_date, market_cap, enterprise_value, pe_ratio, eps, dividend_yield, sector, industry",
    )
    .eq("ticker", ticker)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: trades } = await supabase
    .from("trades")
    .select("shares, price, traded_at, note")
    .eq("ticker", ticker)
    .order("traded_at", { ascending: true });

  const { data: dividends } = await supabase
    .from("cash_transactions")
    .select("amount, occurred_at, note")
    .eq("ticker", ticker)
    .eq("kind", "dividend")
    .order("occurred_at", { ascending: true });

  return NextResponse.json(
    {
      ticker: position.ticker,
      name: position.name,
      committee: position.committee,
      shares_remaining: position.shares_remaining,
      avg_cost_basis: position.avg_cost_basis,
      current_price: position.current_price,
      market_value: position.market_value,
      unrealized_pnl: position.unrealized_pnl,
      unrealized_pct: position.unrealized_pct,
      realized_pnl: position.realized_pnl,
      lots: position.lots.map((l) => ({
        id: l.id,
        shares: l.shares,
        cost_basis: l.cost_basis,
        purchased_at: l.purchased_at,
        remaining_shares: l.remaining_shares,
        realized_pnl: l.realized_pnl,
      })),
      trades: trades ?? [],
      dividends: dividends ?? [],
      fundamentals: snapshot
        ? {
            market_cap: snapshot.market_cap,
            enterprise_value: snapshot.enterprise_value,
            pe_ratio: snapshot.pe_ratio,
            eps: snapshot.eps,
            dividend_yield: snapshot.dividend_yield,
            sector: snapshot.sector,
            industry: snapshot.industry,
            as_of: snapshot.snapshot_date,
          }
        : null,
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}

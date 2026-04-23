import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { allocateTradesFifo } from "@/lib/calc/lots";

const CreateTradeSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9.\-]+$/i, "ticker must be alphanumeric")
    .transform((s) => s.toUpperCase()),
  shares: z.coerce.number().positive(),
  price: z.coerce.number().nonnegative(),
  traded_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request) {
  let caller: { userId: string };
  try {
    caller = await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = CreateTradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Oversell guard: pull all lots + prior trades for this ticker, FIFO-
  // allocate, and reject if the new sell would take shares_remaining
  // below zero.
  const admin = createAdminClient();
  const [lotsRes, tradesRes] = await Promise.all([
    admin
      .from("positions")
      .select("id, ticker, shares, cost_basis, purchased_at")
      .eq("ticker", parsed.data.ticker),
    admin
      .from("trades")
      .select("ticker, shares, price, traded_at")
      .eq("ticker", parsed.data.ticker),
  ]);
  if (lotsRes.error) {
    return NextResponse.json(
      { error: "read_failed", message: lotsRes.error.message },
      { status: 500 },
    );
  }
  if (tradesRes.error) {
    return NextResponse.json(
      { error: "read_failed", message: tradesRes.error.message },
      { status: 500 },
    );
  }
  if (lotsRes.data.length === 0) {
    return NextResponse.json(
      { error: "unknown_ticker", message: `No open lot for ${parsed.data.ticker}` },
      { status: 404 },
    );
  }

  const allocated = allocateTradesFifo(lotsRes.data, tradesRes.data);
  const remaining = allocated.reduce((s, a) => s + a.remaining_shares, 0);
  if (parsed.data.shares > remaining + 1e-6) {
    return NextResponse.json(
      {
        error: "oversold",
        message: `Only ${remaining.toFixed(4)} ${parsed.data.ticker} shares available to sell`,
      },
      { status: 409 },
    );
  }

  const { data: inserted, error: tradeError } = await admin
    .from("trades")
    .insert({
      ticker: parsed.data.ticker,
      shares: parsed.data.shares,
      price: parsed.data.price,
      traded_at: parsed.data.traded_at,
      note: parsed.data.note,
      created_by: caller.userId,
    })
    .select("id")
    .single();
  if (tradeError) {
    return NextResponse.json(
      { error: "insert_failed", message: tradeError.message },
      { status: 400 },
    );
  }

  const { error: cashError } = await admin.from("cash_transactions").insert({
    amount: parsed.data.shares * parsed.data.price,
    kind: "trade_sell",
    ticker: parsed.data.ticker,
    occurred_at: parsed.data.traded_at,
    note: `Sell ${parsed.data.shares} ${parsed.data.ticker} @ ${parsed.data.price}`,
    created_by: caller.userId,
  });
  if (cashError) {
    await admin.from("trades").delete().eq("id", inserted.id);
    return NextResponse.json(
      { error: "cash_insert_failed", message: cashError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: inserted.id }, { status: 201 });
}

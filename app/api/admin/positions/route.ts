import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const CreatePositionSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9.\-]+$/i, "ticker must be alphanumeric")
    .transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1).max(200),
  committee_id: z.string().trim().min(1),
  shares: z.coerce.number().positive(),
  cost_basis: z.coerce.number().nonnegative(),
  purchased_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  thesis: z.string().trim().max(4000).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = CreatePositionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Insert the lot first, then the matching cash outflow. If the cash
  // insert fails, delete the lot so the two stay consistent — Supabase
  // doesn't give us multi-table transactions through the REST client.
  const { data: inserted, error: insertError } = await supabase
    .from("positions")
    .insert({
      ticker: parsed.data.ticker,
      name: parsed.data.name,
      committee_id: parsed.data.committee_id,
      shares: parsed.data.shares,
      cost_basis: parsed.data.cost_basis,
      purchased_at: parsed.data.purchased_at,
      thesis: parsed.data.thesis,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insertError) {
    return NextResponse.json(
      { error: "insert_failed", message: insertError.message },
      { status: 400 },
    );
  }

  const { error: cashError } = await supabase.from("cash_transactions").insert({
    amount: -(parsed.data.shares * parsed.data.cost_basis),
    kind: "trade_buy",
    ticker: parsed.data.ticker,
    occurred_at: parsed.data.purchased_at,
    note: `Buy ${parsed.data.shares} ${parsed.data.ticker} @ ${parsed.data.cost_basis}`,
    created_by: user.id,
  });
  if (cashError) {
    await supabase.from("positions").delete().eq("id", inserted.id);
    return NextResponse.json(
      { error: "cash_insert_failed", message: cashError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: inserted.id }, { status: 201 });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Kinds the PM creates directly. trade_buy / trade_sell are inserted by
// the positions and trades endpoints, not here.
const AdminKind = z.enum([
  "deposit",
  "withdrawal",
  "dividend",
  "fee",
  "adjustment",
]);

const CreateCashSchema = z
  .object({
    kind: AdminKind,
    amount: z.coerce.number(),
    ticker: z
      .string()
      .trim()
      .min(1)
      .max(10)
      .regex(/^[A-Z0-9.\-]+$/i)
      .transform((s) => s.toUpperCase())
      .optional(),
    occurred_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().trim().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    // Dividend must be positive; withdrawal/fee must be negative;
    // deposit must be positive; adjustment is free.
    if (data.kind === "dividend" && data.amount <= 0) {
      ctx.addIssue({ code: "custom", message: "dividend must be positive", path: ["amount"] });
    }
    if (data.kind === "deposit" && data.amount <= 0) {
      ctx.addIssue({ code: "custom", message: "deposit must be positive", path: ["amount"] });
    }
    if (data.kind === "withdrawal" && data.amount >= 0) {
      ctx.addIssue({ code: "custom", message: "withdrawal must be negative", path: ["amount"] });
    }
    if (data.kind === "fee" && data.amount >= 0) {
      ctx.addIssue({ code: "custom", message: "fee must be negative", path: ["amount"] });
    }
    if (data.kind === "dividend" && !data.ticker) {
      ctx.addIssue({ code: "custom", message: "ticker is required for dividends", path: ["ticker"] });
    }
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

  const parsed = CreateCashSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { data: inserted, error } = await supabase
    .from("cash_transactions")
    .insert({
      amount: parsed.data.amount,
      kind: parsed.data.kind,
      ticker: parsed.data.ticker ?? null,
      occurred_at: parsed.data.occurred_at,
      note: parsed.data.note,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json(
      { error: "insert_failed", message: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ id: inserted.id }, { status: 201 });
}

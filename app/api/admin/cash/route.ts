import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CashTransactionKind } from "@/lib/supabase/types";

// Kinds the PM creates directly. trade_buy / trade_sell are inserted by
// the positions and trades endpoints, not here.
const AdminKind = z.enum([
  "deposit",
  "capital_injection",
  "withdrawal",
  "dividend",
  "fee",
  "adjustment",
]);

const TickerSchema = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .regex(/^[A-Z0-9.\-]+$/i)
  .transform((s) => s.toUpperCase());

const CreateCashSchema = z
  .object({
    kind: AdminKind,
    amount: z.coerce.number(),
    ticker: TickerSchema.optional(),
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
    if (data.kind === "capital_injection" && data.amount <= 0) {
      ctx.addIssue({ code: "custom", message: "capital injection must be positive", path: ["amount"] });
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

  const parsed = CreateCashSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("cash_transactions")
    .insert({
      amount: parsed.data.amount,
      kind: parsed.data.kind,
      ticker: parsed.data.ticker ?? null,
      occurred_at: parsed.data.occurred_at,
      note: parsed.data.note,
      created_by: caller.userId,
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

// PATCH /api/admin/cash — edit an existing cash transaction. Kind is
// intentionally not editable post-creation; flipping kinds across sign
// boundaries is too error-prone. Delete + re-create to fix a kind typo.
const PatchCashSchema = z.object({
  id: z.string().uuid(),
  amount: z.coerce.number().optional(),
  occurred_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  ticker: TickerSchema.nullable().optional(),
});

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = PatchCashSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: existing, error: loadErr } = await admin
    .from("cash_transactions")
    .select("id, kind, amount, ticker")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const kind: CashTransactionKind = existing.kind;
  const nextAmount = parsed.data.amount ?? existing.amount;
  const nextTicker =
    parsed.data.ticker === undefined ? existing.ticker : parsed.data.ticker;

  // Mirror the create-path sign/required-field rules against the merged
  // post-edit state so PATCH can't leave a row in an inconsistent shape.
  const issues: { message: string; path: string[] }[] = [];
  if (kind === "dividend" && nextAmount <= 0) {
    issues.push({ message: "dividend must be positive", path: ["amount"] });
  }
  if (kind === "deposit" && nextAmount <= 0) {
    issues.push({ message: "deposit must be positive", path: ["amount"] });
  }
  if (kind === "capital_injection" && nextAmount <= 0) {
    issues.push({ message: "capital injection must be positive", path: ["amount"] });
  }
  if (kind === "withdrawal" && nextAmount >= 0) {
    issues.push({ message: "withdrawal must be negative", path: ["amount"] });
  }
  if (kind === "fee" && nextAmount >= 0) {
    issues.push({ message: "fee must be negative", path: ["amount"] });
  }
  if (kind === "dividend" && !nextTicker) {
    issues.push({ message: "ticker is required for dividends", path: ["ticker"] });
  }
  if (issues.length > 0) {
    return NextResponse.json(
      { error: "invalid_body", issues },
      { status: 400 },
    );
  }

  const patch: {
    amount?: number;
    occurred_at?: string;
    note?: string | null;
    ticker?: string | null;
  } = {};
  if (parsed.data.amount !== undefined) patch.amount = parsed.data.amount;
  if (parsed.data.occurred_at !== undefined) {
    patch.occurred_at = parsed.data.occurred_at;
  }
  if (parsed.data.note !== undefined) patch.note = parsed.data.note;
  if (parsed.data.ticker !== undefined) patch.ticker = parsed.data.ticker;

  const { error: updateErr } = await admin
    .from("cash_transactions")
    .update(patch)
    .eq("id", parsed.data.id);

  if (updateErr) {
    return NextResponse.json(
      { error: "update_failed", message: updateErr.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/cash?id=<uuid> — hard-delete a cash transaction.
// trade_buy / trade_sell rows are managed by the (future) trades flow and
// must not be removable here, because deleting one would strand the
// corresponding position leg.
export async function DELETE(request: Request) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing, error: loadErr } = await admin
    .from("cash_transactions")
    .select("id, kind")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (existing.kind === "trade_buy" || existing.kind === "trade_sell") {
    return NextResponse.json(
      { error: "trade transactions cannot be deleted here" },
      { status: 400 },
    );
  }

  const { error: delErr } = await admin
    .from("cash_transactions")
    .delete()
    .eq("id", id);
  if (delErr) {
    return NextResponse.json(
      { error: "delete_failed", message: delErr.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

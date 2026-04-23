import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// PATCH /api/admin/ticker-meta
// Body: { ticker, target_weight?, intrinsic_value?, value_updated_at? }
//   - Any of the three meta fields can be passed; all are optional so a
//     partial update is fine. `null` clears a field.
//   - value_updated_at accepts YYYY-MM-DD and is stored as
//     `{date}T20:00:00Z` (US market close-ish) in the timestamptz column.
//   - updated_by + updated_at are stamped on every write.

const NullableNumber = z.union([z.number(), z.null()]);
const DateString = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]);

const PatchSchema = z
  .object({
    ticker: z
      .string()
      .trim()
      .min(1)
      .max(10)
      .regex(/^[A-Z0-9.\-]+$/i, "ticker must be alphanumeric")
      .transform((s) => s.toUpperCase()),
    target_weight: NullableNumber.optional(),
    intrinsic_value: NullableNumber.optional(),
    value_updated_at: DateString.optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.target_weight !== undefined &&
      data.target_weight !== null &&
      (data.target_weight < 0 || data.target_weight > 1)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "target_weight must be between 0 and 1",
        path: ["target_weight"],
      });
    }
    if (
      data.intrinsic_value !== undefined &&
      data.intrinsic_value !== null &&
      data.intrinsic_value < 0
    ) {
      ctx.addIssue({
        code: "custom",
        message: "intrinsic_value must be non-negative",
        path: ["intrinsic_value"],
      });
    }
  });

export async function PATCH(request: Request) {
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

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { ticker, target_weight, intrinsic_value, value_updated_at } =
    parsed.data;

  // Build the upsert payload: omit undefined so partial updates leave
  // other columns alone, but explicitly pass null when the caller sent
  // null (that's how a value is cleared).
  const payload: {
    ticker: string;
    target_weight?: number | null;
    intrinsic_value?: number | null;
    value_updated_at?: string | null;
    updated_by: string;
    updated_at: string;
  } = {
    ticker,
    updated_by: caller.userId,
    updated_at: new Date().toISOString(),
  };

  if (target_weight !== undefined) payload.target_weight = target_weight;
  if (intrinsic_value !== undefined) payload.intrinsic_value = intrinsic_value;
  if (value_updated_at !== undefined) {
    payload.value_updated_at =
      value_updated_at === null ? null : `${value_updated_at}T20:00:00Z`;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("ticker_meta")
    .upsert(payload, { onConflict: "ticker" });

  if (error) {
    return NextResponse.json(
      { error: "upsert_failed", message: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

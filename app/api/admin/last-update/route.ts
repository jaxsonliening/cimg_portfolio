import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/audit/log";

// Bulk-set the analyst-update marker. Every ticker_meta row carries its
// own value_updated_at; the dashboard's "last update trading day" is
// max(value_updated_at) across them. The PM occasionally needs to
// correct this date when an update was logged on the wrong day or got
// out of sync with the actual meeting. Setting all rows to the same
// timestamp keeps the max() consistent and avoids per-ticker drift.
//
// We pin the time-of-day to 16:00 ET (20:00 UTC) — the canonical close
// — so the timestamp shape matches what was already stored when the
// PM updated values via the per-ticker UI.

const PatchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
});

export async function PATCH(request: Request) {
  let caller: Awaited<ReturnType<typeof requireAdmin>>;
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

  const ts = `${parsed.data.date}T20:00:00Z`;

  const admin = createAdminClient();
  const { error } = await admin
    .from("ticker_meta")
    .update({ value_updated_at: ts, updated_by: caller.userId })
    .gt("ticker", ""); // match every row; .neq("ticker", null) doesn't suffice
  if (error) {
    return NextResponse.json(
      { error: "update_failed", message: error.message },
      { status: 500 },
    );
  }

  await recordAuditEvent({
    actorUserId: caller.userId,
    actorEmail: caller.email,
    action: "ticker_meta.last_update_set",
    resourceType: "ticker_meta",
    changes: { value_updated_at: ts },
  });

  return NextResponse.json({ ok: true, value_updated_at: ts });
}

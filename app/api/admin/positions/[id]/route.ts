import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ClosePositionSchema = z.object({
  closed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  close_price: z.coerce.number().nonnegative(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

  const parsed = ClosePositionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { data: existing, error: readError } = await supabase
    .from("positions")
    .select("id, closed_at")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    return NextResponse.json(
      { error: "read_failed", message: readError.message },
      { status: 500 },
    );
  }
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (existing.closed_at !== null) {
    return NextResponse.json(
      { error: "already_closed", message: "Position is already closed" },
      { status: 409 },
    );
  }

  const { error: updateError } = await supabase
    .from("positions")
    .update({
      closed_at: parsed.data.closed_at,
      close_price: parsed.data.close_price,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: "update_failed", message: updateError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ id });
}

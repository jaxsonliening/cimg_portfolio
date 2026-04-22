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
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

  const { data, error } = await supabase
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

  if (error) {
    return NextResponse.json(
      { error: "insert_failed", message: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}

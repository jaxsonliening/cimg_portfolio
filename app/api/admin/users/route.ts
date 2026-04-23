import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// GET  /api/admin/users           → list all users with roles
// PATCH /api/admin/users          → { user_id, role } — change another user's role

export async function GET() {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const admin = createAdminClient();
  const {
    data: { users },
    error,
  } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("user_id, role, display_name");
  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const roleByUser = new Map(profiles.map((p) => [p.user_id, p]));

  const out = users.map((u) => {
    const profile = roleByUser.get(u.id);
    return {
      user_id: u.id,
      email: u.email ?? null,
      role: profile?.role ?? "viewer",
      display_name: profile?.display_name ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
    };
  });

  return NextResponse.json({ users: out });
}

const PatchSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["admin", "viewer"]),
});

export async function PATCH(request: Request) {
  let caller: { userId: string };
  try {
    caller = await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  let parsed;
  try {
    parsed = PatchSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid body" },
      { status: 400 },
    );
  }

  // Guardrail: don't let the last admin demote themselves and lock
  // everyone out of the /admin UI. Checked on the server so there's no
  // way around it from a forged request.
  if (parsed.user_id === caller.userId && parsed.role !== "admin") {
    const admin = createAdminClient();
    const { count } = await admin
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "cannot demote the last admin" },
        { status: 400 },
      );
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .upsert(
      { user_id: parsed.user_id, role: parsed.role },
      { onConflict: "user_id" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/users?user_id=<uuid> — fully remove a user. profiles
// row cascades via FK. Guardrails mirror PATCH: can't delete yourself,
// can't delete the last admin.
export async function DELETE(request: Request) {
  let caller: { userId: string };
  try {
    caller = await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const userId = new URL(request.url).searchParams.get("user_id");
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  if (userId === caller.userId) {
    return NextResponse.json(
      { error: "cannot remove yourself" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (target?.role === "admin") {
    const { count } = await admin
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "cannot remove the last admin" },
        { status: 400 },
      );
    }
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

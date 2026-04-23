import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveSafeNext } from "@/lib/auth/safe-next";
import type { EmailOtpType } from "@supabase/supabase-js";

// Handles sign-in links that carry a `token_hash` — the format returned
// by Supabase's admin API (and our /api/admin/users/invite). Differs
// from /auth/callback, which exchanges a PKCE `code` from the normal
// /admin/login flow.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = resolveSafeNext(searchParams.get("next"));

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/admin/login?error=1", origin));
}

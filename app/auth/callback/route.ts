import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveSafeNext } from "@/lib/auth/safe-next";

// Magic-link and OAuth providers redirect here with a short-lived code.
// We exchange it for a session cookie, then send the user to `next`.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = resolveSafeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/admin/login?error=1", origin));
}

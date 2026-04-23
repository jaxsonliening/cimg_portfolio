import { NextResponse } from "next/server";

// Public health endpoint for uptime checks. Returns 200 with a tiny
// JSON payload so monitoring tools can distinguish "app is serving
// requests" from "DNS works but Next didn't boot". Intentionally
// doesn't hit Supabase — a DB check would produce false negatives
// during expected Supabase maintenance windows. Keep dependency-free.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "cimg-portfolio",
    time: new Date().toISOString(),
  });
}

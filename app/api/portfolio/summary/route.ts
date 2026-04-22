import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioSummary } from "@/lib/portfolio/summary";

export const revalidate = 60;

export async function GET() {
  const supabase = await createClient();
  try {
    const summary = await getPortfolioSummary(supabase);
    return NextResponse.json(summary, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { error: "summary_failed", message },
      { status: 500 },
    );
  }
}

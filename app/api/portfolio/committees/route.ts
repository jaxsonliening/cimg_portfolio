import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCommitteeAllocations } from "@/lib/portfolio/committees";

export const revalidate = 60;

export async function GET() {
  const supabase = await createClient();
  try {
    const allocations = await getCommitteeAllocations(supabase);
    return NextResponse.json(allocations, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { error: "committees_failed", message },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPositions } from "@/lib/portfolio/positions";

export const revalidate = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeClosed = searchParams.get("include") === "closed";

  const supabase = await createClient();
  try {
    const positions = await getPositions(supabase, { includeClosed });
    return NextResponse.json(positions, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { error: "positions_failed", message },
      { status: 500 },
    );
  }
}

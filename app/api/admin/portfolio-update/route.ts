import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { getSummary } from "@/lib/portfolio/summary";
import { getPositions } from "@/lib/portfolio/positions";

// PM-facing portfolio update report. Summarizes performance since the
// last analyst-driven intrinsic-value update so the PM can spot which
// names moved on news between weekly meetings.
//
// CSV layout (one file, sectioned with blank rows so Excel parses it):
//   1. Header — as_of, last update date, fund vs SPY since-last-update.
//   2. Top 3 winners since last update (per-position).
//   3. Top 3 losers since last update.
export async function GET() {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const supabase = await createClient();
  const [summary, positions] = await Promise.all([
    getSummary(supabase),
    getPositions(supabase),
  ]);

  const lastUpdate = summary.last_update_trading_day;
  const asOf = summary.as_of;

  // Fund-level since-last-update: take fund_snapshots & SPY closes
  // bracketing the window. Use "<= date desc limit 1" rather than
  // strict equality so a missing exact-date row (e.g. SPY had no
  // 2026-03-31 close because we deleted a bogus one) falls back to
  // the nearest prior trading day instead of returning a dash.
  let cimgPct: number | null = null;
  let spyPct: number | null = null;
  if (lastUpdate) {
    const [fundThen, fundNow, spyThen, spyNow] = await Promise.all([
      supabase
        .from("fund_snapshots")
        .select("total_value")
        .lte("snapshot_date", lastUpdate)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("fund_snapshots")
        .select("total_value")
        .lte("snapshot_date", asOf)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("benchmark_snapshots")
        .select("price")
        .eq("symbol", "SPY")
        .eq("is_daily_close", true)
        .lte("close_date", lastUpdate)
        .order("close_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("benchmark_snapshots")
        .select("price")
        .eq("symbol", "SPY")
        .eq("is_daily_close", true)
        .lte("close_date", asOf)
        .order("close_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (
      fundThen.data &&
      fundNow.data &&
      Number(fundThen.data.total_value) > 0
    ) {
      const then = Number(fundThen.data.total_value);
      const now = Number(fundNow.data.total_value);
      cimgPct = (now - then) / then;
    }
    if (spyThen.data && spyNow.data && Number(spyThen.data.price) > 0) {
      const then = Number(spyThen.data.price);
      const now = Number(spyNow.data.price);
      spyPct = (now - then) / then;
    }
  }

  const moved = positions
    .filter((p) => p.since_last_update_pct !== null)
    .slice()
    .sort(
      (a, b) =>
        (b.since_last_update_pct ?? 0) - (a.since_last_update_pct ?? 0),
    );
  const winners = moved.slice(0, 3);
  const losers = moved.slice(-3).reverse(); // most-negative first

  const fmtPct = (n: number | null): string =>
    n === null
      ? "—"
      : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

  const lines: string[] = [];
  lines.push(csvRow(["CIMG Portfolio Update"]));
  lines.push(csvRow(["As Of", asOf]));
  lines.push(csvRow(["Last Update", lastUpdate ?? "(never)"]));
  lines.push("");
  lines.push(csvRow(["Performance Since Last Update"]));
  lines.push(csvRow(["Series", "Return"]));
  lines.push(csvRow(["CIMG", fmtPct(cimgPct)]));
  lines.push(csvRow(["SPY", fmtPct(spyPct)]));
  lines.push("");
  lines.push(csvRow(["Top 3 Winners (Since Last Update)"]));
  lines.push(csvRow(["Ticker", "Company", "Change"]));
  for (const p of winners) {
    lines.push(csvRow([p.ticker, p.name, fmtPct(p.since_last_update_pct)]));
  }
  lines.push("");
  lines.push(csvRow(["Top 3 Losers (Since Last Update)"]));
  lines.push(csvRow(["Ticker", "Company", "Change"]));
  for (const p of losers) {
    lines.push(csvRow([p.ticker, p.name, fmtPct(p.since_last_update_pct)]));
  }

  // BOM so Excel reliably opens UTF-8 (em-dashes etc. otherwise mojibake).
  const csv = "﻿" + lines.join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cimg-portfolio-update-${asOf}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvRow(cells: (string | null | undefined)[]): string {
  return cells.map(escape).join(",");
}

function escape(cell: string | null | undefined): string {
  if (cell === null || cell === undefined) return "";
  if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

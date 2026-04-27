#!/usr/bin/env node
// Backfill price_snapshots + benchmark_snapshots with Yahoo Finance
// daily closes for every ticker we've ever held. Used once per fresh
// install to light up the week/month/since-last-update change columns
// without waiting 30 days for the live cron to accumulate history.
//
// Usage:
//   npm run backfill-prices
//   npm run backfill-prices -- --days=365   # custom window
//
// Reads Supabase creds from .env.local via Node --env-file. Uses the
// service-role key because we're writing to tables whose RLS permits
// only admin / service-role writes.

import YahooFinance from "yahoo-finance2";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRANSACTIONS_PATH = join(__dirname, "transactions-2024-present.tsv");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
  process.exit(1);
}

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const days = daysArg ? Math.max(30, Number(daysArg.split("=")[1])) : 500;
if (!Number.isFinite(days)) {
  console.error("Invalid --days value.");
  process.exit(1);
}

const yf = new YahooFinance();
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BENCHMARK = "SPY";
const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const { data: positionRows, error: posErr } = await supabase
  .from("positions")
  .select("ticker");
if (posErr) {
  console.error("Failed to read positions:", posErr.message);
  process.exit(1);
}

const heldTickers = Array.from(
  new Set((positionRows ?? []).map((r) => r.ticker)),
);

// Pull every ever-held ticker from the transaction log too. positions
// only tracks current open lots; a ticker that was bought and later
// sold (BRK.B, AVTR, CCI, CG, AKAM, FERG, …) doesn't appear there
// anymore, so without this step its price_snapshots row count stays at
// zero. reconstruct-history then silently skips that ticker on every
// mid-window day, undercounting equity and inflating the chart's
// later-vs-earlier return delta — the original symptom that surfaced
// as CIMG showing ~2x SPY on the 1Y view.
let tsvTickers = [];
try {
  const tsv = readFileSync(TRANSACTIONS_PATH, "utf8");
  const set = new Set();
  for (const line of tsv.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("date\t")) continue;
    const ticker = trimmed.split("\t")[1];
    if (ticker) set.add(ticker.toUpperCase());
  }
  tsvTickers = Array.from(set);
} catch (err) {
  console.error(`Could not read transaction log at ${TRANSACTIONS_PATH}: ${err.message}`);
  process.exit(1);
}

const allSymbols = Array.from(
  new Set([...heldTickers, ...tsvTickers, BENCHMARK]),
);

console.log(
  `Backfilling ${days} days of daily closes for ${allSymbols.length} symbols`,
);

let totalPriceRows = 0;
let totalBenchRows = 0;
const failures = [];

for (const symbol of allSymbols) {
  process.stdout.write(`  ${symbol.padEnd(8)} `);
  try {
    const result = await yf.chart(symbol, {
      period1,
      interval: "1d",
    });

    const closes = (result.quotes ?? []).filter(
      (q) => q.date != null && typeof q.close === "number",
    );

    if (symbol === BENCHMARK) {
      // There are two uniqueness constraints on benchmark_snapshots:
      // the primary key (symbol, observed_at) and a partial unique
      // index on (symbol, close_date) where is_daily_close. Our
      // canonical-time (20:00Z) might collide with an earlier cron
      // run that used the tick-time of whenever it fired, so query
      // the dates already present and skip those.
      const mappedRows = closes.map((q) => {
        const iso = q.date.toISOString();
        const date = iso.slice(0, 10);
        return {
          symbol: BENCHMARK,
          observed_at: `${date}T20:00:00Z`,
          price: q.close,
          is_daily_close: true,
          close_date: date,
        };
      });

      const { data: existingRows } = await supabase
        .from("benchmark_snapshots")
        .select("close_date")
        .eq("symbol", BENCHMARK)
        .eq("is_daily_close", true)
        .in(
          "close_date",
          mappedRows.map((r) => r.close_date),
        );
      const existing = new Set(
        (existingRows ?? []).map((r) => r.close_date),
      );
      const rows = mappedRows.filter((r) => !existing.has(r.close_date));

      if (rows.length) {
        const { error } = await supabase
          .from("benchmark_snapshots")
          .insert(rows);
        if (error) throw new Error(error.message);
      }
      totalBenchRows += rows.length;
      console.log(
        `${rows.length} new benchmark closes (${existing.size} already present)`,
      );
    } else {
      const rows = closes.map((q) => ({
        ticker: symbol,
        snapshot_date: q.date.toISOString().slice(0, 10),
        close_price: q.close,
        source: "yahoo_backfill",
      }));
      if (rows.length) {
        const { error } = await supabase
          .from("price_snapshots")
          .upsert(rows, { onConflict: "ticker,snapshot_date" });
        if (error) throw new Error(error.message);
      }
      totalPriceRows += rows.length;
      console.log(`${rows.length} closes`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`FAILED: ${message}`);
    failures.push({ symbol, message });
  }
}

console.log(`\nDone.`);
console.log(`  price_snapshots upserted:     ${totalPriceRows}`);
console.log(`  benchmark_snapshots upserted: ${totalBenchRows}`);
if (failures.length) {
  console.log(`  failures: ${failures.length}`);
  for (const f of failures) console.log(`    ${f.symbol}: ${f.message}`);
  process.exit(1);
}

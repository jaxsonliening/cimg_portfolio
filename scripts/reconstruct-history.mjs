#!/usr/bin/env node
// Reconstruct daily fund_snapshots from the owner's transaction log.
//
// Inputs:
//   - scripts/transactions-2024-present.tsv (buy/sell + date + shares + price)
//   - public.positions (current holdings — the truth for today)
//   - public.price_snapshots (daily closes, populated by backfill-prices)
//   - public.cash_transactions (sum = current cash balance)
//
// For every trading day from the earliest transaction date through
// today, computes:
//   shares_at_T = current_shares - (buys_after_T) + (sells_after_T)
//   equity_at_T = sum(shares_at_T * close_at_T)
//   cash_at_T   = current_cash  + (buys_after_T * price) - (sells_after_T * price)
//   total_at_T  = equity_at_T + cash_at_T
//
// Working backwards from current-known state means any mis-reconciliation
// between the transaction log and the seed positions gets pushed into the
// starting state, not scattered across the whole chart. A position
// attributed to pre-2024 holdings (sold off during 2024, never bought
// within the log window) gets reconstructed correctly because walking
// backwards shows the shares appearing when the sell is reversed.
//
// Usage:
//   npm run reconstruct-history
//   npm run reconstruct-history -- --start=2024-01-01
//
// Requires prior run of npm run backfill-prices so price_snapshots has
// daily closes for every ever-held ticker.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRANSACTIONS_PATH = join(__dirname, "transactions-2024-present.tsv");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const startArg = process.argv.find((a) => a.startsWith("--start="));
const explicitStart = startArg ? startArg.split("=")[1] : null;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// -- Parse transactions -----------------------------------------------------

const tsv = readFileSync(TRANSACTIONS_PATH, "utf8");
const txs = tsv
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && !line.startsWith("date\t"))
  .map((line) => {
    const [date, ticker, action, sharesStr, priceStr] = line.split("\t");
    return {
      date,
      ticker: ticker.toUpperCase(),
      action: action.toLowerCase(),
      shares: Number(sharesStr.replace(/,/g, "")),
      price: Number(priceStr.replace(/,/g, "")),
    };
  });
txs.sort((a, b) => a.date.localeCompare(b.date));
console.log(`Parsed ${txs.length} transactions`);

// -- Load current state -----------------------------------------------------

const { data: posRows, error: posErr } = await supabase
  .from("positions")
  .select("ticker, shares");
if (posErr) {
  console.error("Failed to read positions:", posErr.message);
  process.exit(1);
}
const currentShares = new Map();
for (const p of posRows ?? []) {
  currentShares.set(p.ticker.toUpperCase(), (currentShares.get(p.ticker.toUpperCase()) ?? 0) + p.shares);
}

const { data: cashRows, error: cashErr } = await supabase
  .from("cash_transactions")
  .select("amount");
if (cashErr) {
  console.error("Failed to read cash_transactions:", cashErr.message);
  process.exit(1);
}
const currentCash = (cashRows ?? []).reduce((s, r) => s + Number(r.amount), 0);
console.log(`Current cash: $${currentCash.toFixed(2)}`);

// -- Load daily closes for every relevant ticker ----------------------------

const everHeldTickers = new Set([...currentShares.keys()]);
for (const tx of txs) everHeldTickers.add(tx.ticker);

const earliestTxDate = txs.length ? txs[0].date : new Date().toISOString().slice(0, 10);
const startDate = explicitStart ?? earliestTxDate;

const { data: snapRows, error: snapErr } = await supabase
  .from("price_snapshots")
  .select("ticker, snapshot_date, close_price")
  .in("ticker", Array.from(everHeldTickers))
  .gte("snapshot_date", startDate);
if (snapErr) {
  console.error("Failed to read price_snapshots:", snapErr.message);
  process.exit(1);
}
const pricesByTickerDate = new Map();
const allDates = new Set();
for (const row of snapRows ?? []) {
  if (!pricesByTickerDate.has(row.ticker)) pricesByTickerDate.set(row.ticker, new Map());
  pricesByTickerDate.get(row.ticker).set(row.snapshot_date, Number(row.close_price));
  allDates.add(row.snapshot_date);
}
const tradingDays = Array.from(allDates).sort();
console.log(`Found ${tradingDays.length} trading days from ${startDate} to ${tradingDays.at(-1) ?? "(none)"}`);
console.log(`  across ${pricesByTickerDate.size} tickers`);

// -- Reverse-walk to find starting holdings ---------------------------------
// holdings(day) = current_shares - sum(buys after day) + sum(sells after day)

const txsByDateAsc = [...txs];
// At the last day (today), holdings = currentShares. For earlier days, we
// undo each transaction that happened between day and today.

function sharesAt(ticker, isoDate) {
  let s = currentShares.get(ticker) ?? 0;
  for (const tx of txsByDateAsc) {
    if (tx.ticker !== ticker) continue;
    if (tx.date <= isoDate) continue; // transaction already in effect by isoDate
    if (tx.action === "buy") s -= tx.shares;
    else if (tx.action === "sell") s += tx.shares;
  }
  return s;
}

function cashAt(isoDate) {
  let c = currentCash;
  for (const tx of txsByDateAsc) {
    if (tx.date <= isoDate) continue;
    const amount = tx.shares * tx.price;
    if (tx.action === "buy") c += amount; // buy-after-T used cash we had at T
    else if (tx.action === "sell") c -= amount; // sell-after-T added cash we didn't have at T
  }
  return c;
}

// -- Sanity-check starting holdings -----------------------------------------

const priorDate = tradingDays[0] ?? startDate;
console.log(`\nImplied holdings just before ${priorDate}:`);
const startHoldings = [];
for (const ticker of everHeldTickers) {
  const s = sharesAt(ticker, priorDate);
  if (s !== 0) startHoldings.push({ ticker, shares: s });
}
startHoldings.sort((a, b) => a.ticker.localeCompare(b.ticker));
for (const h of startHoldings) {
  console.log(`  ${h.ticker.padEnd(8)} ${h.shares.toFixed(0).padStart(10)}`);
}
const implyStartCash = cashAt(priorDate);
console.log(`  CASH     ${implyStartCash.toFixed(2).padStart(13)}`);

if (startHoldings.some((h) => h.shares < 0)) {
  console.log(`\nWARNING: some tickers imply negative starting shares — the transaction log sold`);
  console.log(`  more than we could have held. Reconstruction before those sell dates will be wrong.`);
}

// -- Write daily fund_snapshots ---------------------------------------------

const fundRows = [];
let missingCloseDays = 0;

for (const day of tradingDays) {
  let equity = 0;
  let anyPrice = false;
  for (const ticker of everHeldTickers) {
    const s = sharesAt(ticker, day);
    if (s === 0) continue;
    const close = pricesByTickerDate.get(ticker)?.get(day);
    if (close === undefined) continue;
    equity += s * close;
    anyPrice = true;
  }
  if (!anyPrice) {
    missingCloseDays++;
    continue;
  }
  const cash = cashAt(day);
  const total = equity + cash;
  fundRows.push({
    snapshot_date: day,
    total_value: round2(total),
    cash: round2(cash),
  });
}

console.log(`\nBuilt ${fundRows.length} daily fund_snapshots`);
if (missingCloseDays > 0) console.log(`  skipped ${missingCloseDays} days with no price data`);

if (fundRows.length === 0) {
  console.error("No rows to write. Did you run `npm run backfill-prices` first?");
  process.exit(1);
}

// Upsert in batches so a large backfill doesn't blow the payload limit.
const BATCH = 200;
let written = 0;
for (let i = 0; i < fundRows.length; i += BATCH) {
  const batch = fundRows.slice(i, i + BATCH);
  const { error } = await supabase
    .from("fund_snapshots")
    .upsert(batch, { onConflict: "snapshot_date" });
  if (error) {
    console.error(`Upsert failed at batch ${i / BATCH}:`, error.message);
    process.exit(1);
  }
  written += batch.length;
  process.stdout.write(`  wrote ${written}/${fundRows.length}\r`);
}
console.log(`\nDone. ${written} fund_snapshot rows upserted.`);
console.log(`First: ${fundRows[0].snapshot_date}  total $${fundRows[0].total_value.toLocaleString()}`);
console.log(`Last:  ${fundRows.at(-1).snapshot_date}  total $${fundRows.at(-1).total_value.toLocaleString()}`);

function round2(n) {
  return Math.round(n * 100) / 100;
}

import { describe, it, expect } from "vitest";
import { allocateTradesFifo, averageCostBasis, type Lot, type Trade } from "./lots";

function lot(
  id: string,
  purchased_at: string,
  shares: number,
  cost_basis: number,
): Lot {
  return { id, ticker: "AAPL", shares, cost_basis, purchased_at };
}
function trade(traded_at: string, shares: number, price: number): Trade {
  return { ticker: "AAPL", shares, price, traded_at };
}

describe("allocateTradesFifo", () => {
  it("leaves lots untouched when there are no trades", () => {
    const lots = [lot("a", "2024-01-01", 100, 50)];
    const out = allocateTradesFifo(lots, []);
    expect(out).toEqual([
      { ...lots[0], remaining_shares: 100, realized_pnl: 0 },
    ]);
  });

  it("consumes the oldest lot first", () => {
    const lots = [
      lot("new", "2024-06-01", 100, 100),
      lot("old", "2024-01-01", 100, 50),
    ];
    const out = allocateTradesFifo(lots, [trade("2024-07-01", 40, 80)]);

    const byId = new Map(out.map((l) => [l.id, l]));
    expect(byId.get("old")?.remaining_shares).toBe(60);
    expect(byId.get("new")?.remaining_shares).toBe(100);
    // Realized = 40 × (80 - 50) = 1,200
    expect(byId.get("old")?.realized_pnl).toBe(1200);
    expect(byId.get("new")?.realized_pnl).toBe(0);
  });

  it("spills across lots when a single trade exceeds the oldest lot", () => {
    const lots = [
      lot("a", "2024-01-01", 60, 10),
      lot("b", "2024-03-01", 60, 20),
    ];
    const out = allocateTradesFifo(lots, [trade("2024-04-01", 100, 30)]);

    const byId = new Map(out.map((l) => [l.id, l]));
    expect(byId.get("a")?.remaining_shares).toBe(0);
    expect(byId.get("b")?.remaining_shares).toBe(20);
    // a: 60 × (30-10) = 1200; b: 40 × (30-20) = 400
    expect(byId.get("a")?.realized_pnl).toBe(1200);
    expect(byId.get("b")?.realized_pnl).toBe(400);
  });

  it("applies trades in date order", () => {
    const lots = [lot("a", "2024-01-01", 100, 10)];
    const out = allocateTradesFifo(lots, [
      trade("2024-06-01", 30, 25),
      trade("2024-03-01", 40, 20),
    ]);
    expect(out[0].remaining_shares).toBe(30);
    // Realized across both trades: 40×(20-10) + 30×(25-10) = 400 + 450 = 850
    expect(out[0].realized_pnl).toBe(850);
  });

  it("ignores oversold shares instead of throwing", () => {
    const lots = [lot("a", "2024-01-01", 10, 5)];
    const out = allocateTradesFifo(lots, [trade("2024-02-01", 50, 9)]);
    expect(out[0].remaining_shares).toBe(0);
    // Only 10 shares could be sold: 10 × (9 - 5) = 40
    expect(out[0].realized_pnl).toBe(40);
  });

  it("handles a losing trade (negative realized)", () => {
    const lots = [lot("a", "2024-01-01", 100, 80)];
    const out = allocateTradesFifo(lots, [trade("2024-02-01", 50, 60)]);
    expect(out[0].remaining_shares).toBe(50);
    expect(out[0].realized_pnl).toBe(-1000);
  });

  it("keeps fractional shares stable through subtraction", () => {
    const lots = [lot("a", "2024-01-01", 10.5, 100)];
    const out = allocateTradesFifo(lots, [trade("2024-02-01", 10.25, 120)]);
    expect(out[0].remaining_shares).toBe(0.25);
    // 10.25 * (120 - 100) = 205
    expect(out[0].realized_pnl).toBe(205);
  });

  it("does not mutate the input arrays", () => {
    const lots = [lot("a", "2024-01-01", 100, 10), lot("b", "2024-06-01", 100, 20)];
    const trades = [trade("2024-07-01", 50, 25)];
    const snapshot = JSON.stringify({ lots, trades });
    allocateTradesFifo(lots, trades);
    expect(JSON.stringify({ lots, trades })).toBe(snapshot);
  });
});

describe("averageCostBasis", () => {
  it("returns null when no shares remain", () => {
    const lots = allocateTradesFifo(
      [lot("a", "2024-01-01", 10, 50)],
      [trade("2024-02-01", 10, 60)],
    );
    expect(averageCostBasis(lots)).toBeNull();
  });

  it("weights by remaining shares, not original shares", () => {
    // Start: 100 @ $10, 100 @ $20.  Sell 50 from the oldest.
    // Remaining: 50 @ $10, 100 @ $20 → weighted avg = (50×10 + 100×20) / 150 = 16.6667
    const lots = allocateTradesFifo(
      [lot("a", "2024-01-01", 100, 10), lot("b", "2024-06-01", 100, 20)],
      [trade("2024-07-01", 50, 99)],
    );
    expect(averageCostBasis(lots)).toBeCloseTo(16.6667, 4);
  });

  it("is the plain cost basis for a single untouched lot", () => {
    const lots = allocateTradesFifo([lot("a", "2024-01-01", 42, 137.5)], []);
    expect(averageCostBasis(lots)).toBe(137.5);
  });
});

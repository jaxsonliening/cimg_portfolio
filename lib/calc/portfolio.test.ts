import { describe, it, expect } from "vitest";
import {
  computeCommitteeAllocations,
  type CommitteeRow,
  type OpenPosition,
} from "./portfolio";

const COMMITTEES: CommitteeRow[] = [
  { id: "tech", name: "Technology", color: "#3b82f6", display_order: 1 },
  { id: "financials", name: "Financials", color: "#6366f1", display_order: 2 },
  { id: "healthcare", name: "Healthcare", color: "#10b981", display_order: 8 },
];

describe("computeCommitteeAllocations", () => {
  it("sums shares × price into each committee", () => {
    const positions: OpenPosition[] = [
      { ticker: "AAPL", committee_id: "tech", shares: 100 },
      { ticker: "MSFT", committee_id: "tech", shares: 50 },
      { ticker: "JPM", committee_id: "financials", shares: 30 },
    ];
    const prices = new Map([
      ["AAPL", 200],
      ["MSFT", 400],
      ["JPM", 150],
    ]);

    const { allocations, total } = computeCommitteeAllocations(
      COMMITTEES,
      positions,
      prices,
    );

    // tech = 100*200 + 50*400 = 40,000; financials = 30*150 = 4,500
    expect(total).toBe(44500);

    const byId = new Map(allocations.map((a) => [a.id, a]));
    expect(byId.get("tech")?.value).toBe(40000);
    expect(byId.get("financials")?.value).toBe(4500);
    expect(byId.get("healthcare")?.value).toBe(0);
    expect(byId.get("tech")?.pct).toBeCloseTo(40000 / 44500, 6);
    expect(byId.get("healthcare")?.pct).toBe(0);
  });

  it("orders output by display_order", () => {
    const allocations = computeCommitteeAllocations(COMMITTEES, [], new Map()).allocations;
    expect(allocations.map((a) => a.id)).toEqual(["tech", "financials", "healthcare"]);
  });

  it("treats missing prices as zero (contributes nothing, doesn't throw)", () => {
    const positions: OpenPosition[] = [
      { ticker: "AAPL", committee_id: "tech", shares: 100 },
      { ticker: "GHOST", committee_id: "tech", shares: 50 },
    ];
    const prices = new Map([["AAPL", 200]]);

    const { allocations, total } = computeCommitteeAllocations(
      COMMITTEES,
      positions,
      prices,
    );
    expect(total).toBe(20000);
    expect(allocations.find((a) => a.id === "tech")?.value).toBe(20000);
  });

  it("returns zero-value allocations with pct=0 when the portfolio is empty", () => {
    const { allocations, total } = computeCommitteeAllocations(
      COMMITTEES,
      [],
      new Map(),
    );
    expect(total).toBe(0);
    expect(allocations.every((a) => a.value === 0 && a.pct === 0)).toBe(true);
  });

  it("ignores positions whose committee isn't in the committee list", () => {
    // Orphan committee: the position's value still counts toward `total`
    // (it's real money) but there's no allocation row to put it on.
    const positions: OpenPosition[] = [
      { ticker: "AAPL", committee_id: "tech", shares: 100 },
      { ticker: "ORPHAN", committee_id: "not_a_real_committee", shares: 100 },
    ];
    const prices = new Map([
      ["AAPL", 10],
      ["ORPHAN", 5],
    ]);
    const { allocations, total } = computeCommitteeAllocations(
      COMMITTEES,
      positions,
      prices,
    );
    expect(total).toBe(1500);
    expect(allocations.map((a) => a.id).sort()).toEqual(
      ["financials", "healthcare", "tech"].sort(),
    );
    // The 500 attributed to the orphan is in `total` but not in any row's value.
    const summed = allocations.reduce((s, a) => s + a.value, 0);
    expect(summed).toBe(1000);
  });
});

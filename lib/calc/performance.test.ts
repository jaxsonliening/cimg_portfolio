import { describe, it, expect } from "vitest";
import {
  buildIntradayFundSeries,
  normalizeToHundred,
  type Tick,
  type PositionShares,
} from "./performance";

describe("buildIntradayFundSeries", () => {
  it("returns an empty series when no ticks exist", () => {
    const positions: PositionShares[] = [{ ticker: "AAPL", shares: 10 }];
    expect(buildIntradayFundSeries(positions, new Map())).toEqual([]);
  });

  it("uses the most recent tick at-or-before each timestamp", () => {
    const positions: PositionShares[] = [
      { ticker: "AAPL", shares: 10 },
      { ticker: "MSFT", shares: 5 },
    ];
    const ticks = new Map<string, Tick[]>([
      [
        "AAPL",
        [
          { observed_at: "2026-04-22T13:30:00Z", price: 200 },
          { observed_at: "2026-04-22T13:45:00Z", price: 210 },
        ],
      ],
      ["MSFT", [{ observed_at: "2026-04-22T13:45:00Z", price: 400 }]],
    ]);

    const series = buildIntradayFundSeries(positions, ticks);
    expect(series).toEqual([
      // @ 13:30 — AAPL has a tick (200), MSFT has none yet (0)
      { t: "2026-04-22T13:30:00Z", fund: 10 * 200 },
      // @ 13:45 — AAPL updated to 210, MSFT appears at 400
      { t: "2026-04-22T13:45:00Z", fund: 10 * 210 + 5 * 400 },
    ]);
  });

  it("unions timestamps across tickers and sorts them", () => {
    const positions: PositionShares[] = [{ ticker: "A", shares: 1 }, { ticker: "B", shares: 1 }];
    const ticks = new Map<string, Tick[]>([
      ["A", [{ observed_at: "2026-04-22T14:00:00Z", price: 10 }]],
      ["B", [{ observed_at: "2026-04-22T13:00:00Z", price: 20 }]],
    ]);
    const series = buildIntradayFundSeries(positions, ticks);
    expect(series.map((s) => s.t)).toEqual([
      "2026-04-22T13:00:00Z",
      "2026-04-22T14:00:00Z",
    ]);
  });

  it("ignores positions that have no tick map entry", () => {
    const positions: PositionShares[] = [
      { ticker: "A", shares: 1 },
      { ticker: "NEVER_TICKED", shares: 999 },
    ];
    const ticks = new Map<string, Tick[]>([
      ["A", [{ observed_at: "2026-04-22T13:00:00Z", price: 10 }]],
    ]);
    const series = buildIntradayFundSeries(positions, ticks);
    expect(series).toEqual([{ t: "2026-04-22T13:00:00Z", fund: 10 }]);
  });

  it("rounds fund values to 2 decimal places", () => {
    const positions: PositionShares[] = [{ ticker: "A", shares: 1 / 3 }];
    const ticks = new Map<string, Tick[]>([
      ["A", [{ observed_at: "2026-04-22T13:00:00Z", price: 100 }]],
    ]);
    const [first] = buildIntradayFundSeries(positions, ticks);
    expect(first.fund).toBe(33.33);
  });
});

describe("normalizeToHundred", () => {
  it("anchors the first point at 100 and scales the rest proportionally", () => {
    const rows = [
      { t: "a", price: 500 },
      { t: "b", price: 550 },
      { t: "c", price: 450 },
    ];
    expect(normalizeToHundred(rows)).toEqual([
      { t: "a", value: 100 },
      { t: "b", value: 110 },
      { t: "c", value: 90 },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(normalizeToHundred([])).toEqual([]);
  });

  it("emits zeros when the base price is zero (no divide-by-zero)", () => {
    const rows = [
      { t: "a", price: 0 },
      { t: "b", price: 100 },
    ];
    expect(normalizeToHundred(rows)).toEqual([
      { t: "a", value: 0 },
      { t: "b", value: 0 },
    ]);
  });

  it("drops the `price` key from output rows", () => {
    const [row] = normalizeToHundred([{ t: "a", price: 100, extra: "keep" }]);
    expect(row).toEqual({ t: "a", extra: "keep", value: 100 });
    expect("price" in row).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  computeRiskMetrics,
  dailyReturns,
  maxDrawdown,
  mean,
  regressionSlope,
  stdev,
} from "./risk";

describe("dailyReturns", () => {
  it("produces n-1 returns for n values", () => {
    expect(dailyReturns([100, 110, 121])).toEqual([0.1, 0.1]);
  });
  it("handles zero gracefully by skipping", () => {
    expect(dailyReturns([0, 100, 110])).toEqual([0.1]);
  });
  it("empty input yields empty output", () => {
    expect(dailyReturns([])).toEqual([]);
    expect(dailyReturns([100])).toEqual([]);
  });
});

describe("maxDrawdown", () => {
  it("returns 0 when the series only rises", () => {
    expect(maxDrawdown([100, 110, 120, 150])).toBe(0);
  });
  it("finds peak-to-trough", () => {
    // Peak 150 then dip to 105 = -0.30
    expect(maxDrawdown([100, 150, 120, 105, 140])).toBeCloseTo(-0.3, 6);
  });
  it("picks the worst drawdown across multiple peaks", () => {
    // First peak 120 -> trough 60 = -0.5, second peak 200 -> 150 = -0.25
    expect(maxDrawdown([100, 120, 60, 200, 150])).toBeCloseTo(-0.5, 6);
  });
  it("returns null on empty input", () => {
    expect(maxDrawdown([])).toBeNull();
  });
});

describe("regressionSlope", () => {
  it("slope of y=2x is 2", () => {
    const x = [1, 2, 3, 4, 5];
    const y = x.map((v) => 2 * v);
    expect(regressionSlope(x, y)).toBeCloseTo(2, 6);
  });
  it("slope of y=0.5x+10 is 0.5", () => {
    const x = [0, 2, 4, 6, 8];
    const y = x.map((v) => 0.5 * v + 10);
    expect(regressionSlope(x, y)).toBeCloseTo(0.5, 6);
  });
  it("returns null when x has zero variance", () => {
    expect(regressionSlope([5, 5, 5], [1, 2, 3])).toBeNull();
  });
});

describe("mean / stdev", () => {
  it("mean and sample-stdev of a known series", () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(xs)).toBe(5);
    // sample std with n-1 is 2.138089935... let's just check closeness
    expect(stdev(xs)).toBeCloseTo(2.138, 3);
  });
});

describe("computeRiskMetrics", () => {
  it("fund that mirrors benchmark 1:1 has beta 1", () => {
    const fund = [100, 102, 101, 104, 105];
    const bench = [200, 204, 202, 208, 210]; // exactly 2x fund every day
    const m = computeRiskMetrics(fund, bench);
    expect(m.beta).toBeCloseTo(1, 6);
  });

  it("fund with twice benchmark returns has beta 2", () => {
    // Build benchmark returns, then make fund returns 2x of those
    const benchReturns = [0.01, -0.02, 0.015, -0.01, 0.005];
    const bench = [100];
    for (const r of benchReturns) bench.push(bench[bench.length - 1] * (1 + r));
    const fund = [100];
    for (const r of benchReturns)
      fund.push(fund[fund.length - 1] * (1 + 2 * r));
    const m = computeRiskMetrics(fund, bench);
    expect(m.beta).toBeCloseTo(2, 3);
  });

  it("annualized volatility scales daily sigma by sqrt(252)", () => {
    const fund = [100, 101, 100, 101, 100, 101, 100, 101];
    const bench = fund.slice();
    const m = computeRiskMetrics(fund, bench);
    // Daily returns alternate +1%/-1% (approx); std ≈ 0.01
    // annualized ≈ 0.01 * sqrt(252) ≈ 0.158
    expect(m.volatility).not.toBeNull();
    expect(m.volatility!).toBeGreaterThan(0.1);
    expect(m.volatility!).toBeLessThan(0.3);
  });

  it("max drawdown is exposed alongside other metrics", () => {
    const fund = [100, 120, 90, 110, 70];
    const bench = [100, 110, 105, 115, 100];
    const m = computeRiskMetrics(fund, bench);
    expect(m.max_drawdown).toBeCloseTo((70 - 120) / 120, 6);
  });

  it("returns nulls gracefully when the series is too short", () => {
    const m = computeRiskMetrics([100], [100]);
    expect(m.beta).toBeNull();
    expect(m.volatility).toBeNull();
    expect(m.sharpe).toBeNull();
    expect(m.observations).toBe(0);
  });

  it("throws if inputs have different lengths", () => {
    expect(() => computeRiskMetrics([1, 2, 3], [1, 2])).toThrow();
  });
});

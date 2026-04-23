// Professional-grade risk metrics computed from a daily portfolio
// value series and an aligned benchmark series.
//
// All four metrics are standard in fund reporting:
//
//   - beta: slope of a linear regression of portfolio daily returns
//     on benchmark daily returns. β = 1 means we move with SPY; > 1
//     means we're more volatile than SPY; < 1 means less.
//   - volatility: annualized standard deviation of daily returns.
//     Multiply daily σ by √252 to get the annualized figure that
//     analysts use in Sharpe etc.
//   - sharpe: (annualized return − risk-free) / annualized σ. The
//     canonical "return per unit of risk" number. Risk-free default
//     of 0.04 (4%) tracks the 1Y Treasury roughly.
//   - maxDrawdown: peak-to-trough % decline over the window. The
//     "worst you would have felt" number; helps contextualize
//     long-run returns against short-term pain.
//
// Inputs are arrays of daily values (not returns). We compute the
// daily return series internally so the caller doesn't have to
// worry about alignment, div-by-zero, or skip-day handling.

export type RiskMetrics = {
  beta: number | null;
  volatility: number | null;       // annualized, decimal (0.18 = 18%)
  sharpe: number | null;
  max_drawdown: number | null;     // decimal, negative (-0.12 = -12%)
  observations: number;            // number of daily returns used
};

const TRADING_DAYS_PER_YEAR = 252;

export function computeRiskMetrics(
  fundValues: number[],
  benchValues: number[],
  options: { riskFree?: number } = {},
): RiskMetrics {
  if (fundValues.length !== benchValues.length) {
    throw new Error("fundValues and benchValues must be the same length");
  }

  const fundReturns = dailyReturns(fundValues);
  const benchReturns = dailyReturns(benchValues);
  const observations = fundReturns.length;

  if (observations < 2) {
    return {
      beta: null,
      volatility: null,
      sharpe: null,
      max_drawdown: maxDrawdown(fundValues),
      observations,
    };
  }

  const vol = stdev(fundReturns) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  const riskFree = options.riskFree ?? 0.04;
  const annualizedMean = mean(fundReturns) * TRADING_DAYS_PER_YEAR;
  const sharpe = vol === 0 ? null : (annualizedMean - riskFree) / vol;

  return {
    beta: regressionSlope(benchReturns, fundReturns),
    volatility: vol,
    sharpe,
    max_drawdown: maxDrawdown(fundValues),
    observations,
  };
}

// Consecutive daily returns from a values series. Skips pairs where
// the prior value is 0 so we don't emit Infinity.
export function dailyReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    if (prev === 0) continue;
    out.push((values[i] - prev) / prev);
  }
  return out;
}

export function maxDrawdown(values: number[]): number | null {
  if (values.length === 0) return null;
  let peak = values[0];
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak === 0) continue;
    const dd = (v - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return worst;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let sq = 0;
  for (const x of xs) sq += (x - m) ** 2;
  return Math.sqrt(sq / (xs.length - 1));
}

// OLS slope of y regressed on x. cov(x,y) / var(x). Returns null if
// the regressor has zero variance (horizontal x).
export function regressionSlope(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 2) return null;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let den = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx;
    num += dx * (y[i] - my);
    den += dx * dx;
  }
  if (den === 0) return null;
  return num / den;
}

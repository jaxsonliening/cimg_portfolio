// Shared shapes for the dashboard rebuild. Backend (lib/portfolio/*)
// produces these; UI (components/*, app/page.tsx) consumes them. When
// underlying data isn't available (e.g. not enough history for
// annualized return), the field is null and the UI renders it as "—".

// ---------- positions row ----------

export type PositionRow = {
  ticker: string;
  name: string;                // "Company" column
  committee: { id: string; name: string; color: string | null } | null;

  // Price movement.
  day_change_pct: number | null;
  week_change_pct: number | null;
  month_change_pct: number | null;
  since_last_update_pct: number | null;      // vs price at ticker_meta.value_updated_at

  // Returns.
  total_return_pct: number | null;           // (current - avg_cost) / avg_cost
  annualized_return_pct: number | null;      // null if < 1Y held; UI shows "<1Yr"
  held_less_than_one_year: boolean;

  // Prices + cost.
  current_price: number | null;
  avg_cost: number | null;

  // Weights.
  current_weight: number | null;             // market_value / total_equity_market_value
  target_weight: number | null;              // ticker_meta.target_weight

  // Value / valuation.
  intrinsic_value: number | null;            // per-share intrinsic value
  v_over_p: number | null;                   // intrinsic_value / current_price

  // P&L + size.
  unrealized_pnl: number | null;             // shares * (current_price - avg_cost)
  current_size: number | null;               // shares * current_price (market value)
  current_quantity: number;                  // shares remaining after FIFO
  initial_purchase: string;                  // earliest lot purchased_at (YYYY-MM-DD)
};

// ---------- summary panel ----------

export type PortfolioSummary = {
  // Values.
  market_value_equities: number;
  cash_balance: number;
  cash_position_pct: number;
  market_value_portfolio: number;
  intrinsic_value_portfolio: number;
  equity_vp_ex_cash: number | null;

  // Performance windows. All numbers are fractions (0.072 = 7.2%).
  // Null when history isn't sufficient to compute yet.
  cimg_pre_capital_injection_pct: number | null;
  spy_pre_capital_injection_pct: number | null;
  cimg_post_capital_injection_pct: number | null;
  spy_post_capital_injection_pct: number | null;
  cimg_ytd_pct: number | null;
  spy_ytd_pct: number | null;
  cimg_day_change_pct: number | null;
  spy_day_change_pct: number | null;

  // Dates.
  last_update_trading_day: string | null;    // from max(ticker_meta.value_updated_at)
  capital_injection_date: string | null;     // from latest cash_transactions kind='capital_injection'
  as_of: string;                             // YYYY-MM-DD of most recent snapshot used
};

// ---------- winners / losers ----------

export type MoverRow = {
  ticker: string;
  name: string;
  day_change_pct: number;
};

export type WinnersLosers = {
  winners: MoverRow[];    // up to 3, sorted desc
  losers: MoverRow[];     // up to 3, sorted asc
};

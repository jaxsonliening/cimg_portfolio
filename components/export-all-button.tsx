"use client";

import type { PortfolioSummary, PositionRow, WinnersLosers } from "@/lib/portfolio/types";
import { downloadCsv, toCsv } from "./export";

// Single "Download All" generator. One CSV, stacked sections:
//   Portfolio Summary → Positions (Portfolio view) → Positions (Fundamentals view)
//   → Winners → Losers. Sections are separated by a blank row and a
// section-title row so Excel users can visually parse. Numbers are raw;
// percentages export as decimals (header labels say "(decimal)").

type Args = {
  summary: PortfolioSummary;
  positions: PositionRow[];
  moves: WinnersLosers;
};

export function ExportAllButton({ summary, positions, moves }: Args) {
  function download() {
    const blocks: string[] = [];
    blocks.push(
      toCsv(
        ["Metric", "Value"],
        [
          ["Prices As Of", summary.as_of],
          ["Portfolio Last Updated", summary.last_update_trading_day ?? ""],
          ["Capital Injection Date", summary.capital_injection_date ?? ""],
          ["Market Value of Equities ($)", summary.market_value_equities],
          ["Cash Balance ($)", summary.cash_balance],
          ["Cash Position % (decimal)", summary.cash_position_pct],
          ["Market Value of Portfolio ($)", summary.market_value_portfolio],
          ["Intrinsic Value of Portfolio ($)", summary.intrinsic_value_portfolio],
          ["Equity Portfolio V/P (ex-Cash)", summary.equity_vp_ex_cash],
          ["CIMG Performance Pre Capital Injection (decimal)", summary.cimg_pre_capital_injection_pct],
          ["SPY Performance Pre Capital Injection (decimal)", summary.spy_pre_capital_injection_pct],
          ["CIMG Performance Post Capital Injection (decimal)", summary.cimg_post_capital_injection_pct],
          ["SPY Performance Post Capital Injection (decimal)", summary.spy_post_capital_injection_pct],
          ["CIMG Performance YTD (decimal)", summary.cimg_ytd_pct],
          ["SPY Performance YTD (decimal)", summary.spy_ytd_pct],
          ["CIMG Day Change (decimal)", summary.cimg_day_change_pct],
          ["SPY Day Change (decimal)", summary.spy_day_change_pct],
        ],
      ),
    );

    const positionsHeader = [
      "Company", "Ticker",
      "Day Change (decimal)", "Week Change (decimal)", "Month Change (decimal)",
      "Since Last Update (decimal)", "Total Return (decimal)", "Annualized Return (decimal)",
      "Current Price ($)", "Average Cost ($)",
      "Current Weight (decimal)", "Target Weight (decimal)",
      "Intrinsic Value Estimate ($)", "V/P",
      "Unrealized P/L ($)", "Current Size ($)", "Current Quantity",
      "Initial Purchase", "Committee",
    ];
    const positionsRows = positions.map((p) => [
      p.name, p.ticker,
      p.day_change_pct, p.week_change_pct, p.month_change_pct,
      p.since_last_update_pct, p.total_return_pct,
      p.held_less_than_one_year ? null : p.annualized_return_pct,
      p.current_price, p.avg_cost,
      p.current_weight, p.target_weight,
      p.intrinsic_value, p.v_over_p,
      p.unrealized_pnl, p.current_size, p.current_quantity,
      p.initial_purchase, p.committee?.name ?? null,
    ]);
    blocks.push(toCsv(positionsHeader, positionsRows));

    const fundamentalsHeader = [
      "Company", "Ticker", "Sector", "Industry",
      "Market Cap ($)", "Enterprise Value ($)",
      "P/E", "EPS ($)", "Dividend Yield (decimal)",
      "Current Price ($)",
    ];
    const fundamentalsRows = positions.map((p) => [
      p.name, p.ticker, p.sector, p.industry,
      p.market_cap, p.enterprise_value,
      p.pe_ratio, p.eps, p.dividend_yield,
      p.current_price,
    ]);
    blocks.push(toCsv(fundamentalsHeader, fundamentalsRows));

    blocks.push(
      toCsv(
        ["Biggest Winners", "Ticker", "Day Change (decimal)"],
        moves.winners.map((w) => [w.name, w.ticker, w.day_change_pct]),
      ),
    );
    blocks.push(
      toCsv(
        ["Biggest Losers", "Ticker", "Day Change (decimal)"],
        moves.losers.map((l) => [l.name, l.ticker, l.day_change_pct]),
      ),
    );

    const filename = `cimg-portfolio-${summary.as_of}.csv`;
    // blocks already start with a UTF-8 BOM; stack them with a blank row between.
    // Stripping the BOM from the 2nd+ blocks keeps the file valid for Excel.
    const first = blocks[0];
    const rest = blocks.slice(1).map((b) => b.replace(/^﻿/, ""));
    const combined = [first, ...rest].join("\r\n\r\n");
    downloadCsv(filename, combined);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="rounded-lg bg-gray-900 dark:bg-gray-100 px-3 py-2 text-sm font-medium text-white dark:text-gray-900 shadow-sm transition-all hover:bg-gray-800 dark:hover:bg-gray-200"
    >
      Download All (CSV)
    </button>
  );
}

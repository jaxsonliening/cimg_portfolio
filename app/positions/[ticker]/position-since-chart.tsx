"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const TICKER_COLOR = "#6366f1"; // indigo
const SPY_COLOR = "#f59e0b";    // amber

type Point = {
  t: string;
  ticker_pct: number | null;
  spy_pct: number | null;
};

export function PositionSinceChart({
  data,
  ticker,
}: {
  data: Point[];
  ticker: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-md bg-gray-50 dark:bg-gray-800 text-sm text-gray-400 dark:text-gray-500">
        Not enough price history yet.
      </div>
    );
  }
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 12, right: 12, top: 8 }}>
          <CartesianGrid
            stroke="currentColor"
            strokeOpacity={0.12}
            className="text-gray-500 dark:text-gray-400"
          />
          <XAxis
            dataKey="t"
            tickFormatter={formatTick}
            stroke="currentColor"
            className="text-gray-500 dark:text-gray-400"
            fontSize={11}
            minTickGap={40}
          />
          <YAxis
            stroke="currentColor"
            className="text-gray-500 dark:text-gray-400"
            fontSize={11}
            tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(17, 24, 39, 0.95)",
              border: "1px solid rgba(75, 85, 99, 0.5)",
              borderRadius: "0.5rem",
              color: "#f9fafb",
              fontSize: "0.75rem",
            }}
            labelStyle={{ color: "#d1d5db" }}
            labelFormatter={formatTooltip}
            formatter={(value) =>
              typeof value !== "number"
                ? ["—"]
                : [`${value >= 0 ? "+" : ""}${value.toFixed(2)}%`]
            }
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="ticker_pct"
            name={ticker}
            stroke={TICKER_COLOR}
            strokeWidth={2.5}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="spy_pct"
            name="S&P 500"
            stroke={SPY_COLOR}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatTick(t: string): string {
  const d = new Date(t);
  return `${MONTH_ABBR[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(-2)}`;
}

function formatTooltip(t: string): string {
  const d = new Date(t);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

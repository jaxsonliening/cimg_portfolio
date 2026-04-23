"use client";

import { useEffect, useState } from "react";
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
import { ExportButton } from "./export-button";

const RANGES = ["1D", "1M", "3M", "6M", "YTD", "1Y", "ALL"] as const;
type Range = (typeof RANGES)[number];

type Point = { t: string; fund: number; benchmark: number | null };

export function PerformanceChart() {
  const [range, setRange] = useState<Range>("YTD");
  const [data, setData] = useState<Point[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- need to flip to "loading" before the async fetch resolves
    setStatus("loading");
    fetch(`/api/portfolio/performance?range=${range}`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setData(Array.isArray(body.series) ? body.series : []);
        setStatus("idle");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Fund vs S&amp;P 500</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  r === range
                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <ExportButton
            filename={`performance-${range}.csv`}
            build={() => ({
              headers: ["Date", "Fund ($)", "S&P 500"],
              rows: data.map((p) => [p.t, p.fund, p.benchmark]),
            })}
          />
        </div>
      </div>

      <div className="h-96">
        {status === "error" ? (
          <Empty>Couldn&apos;t load performance data.</Empty>
        ) : status === "loading" && data.length === 0 ? (
          <div className="skeleton h-full w-full" aria-label="Loading performance data" />
        ) : data.length === 0 ? (
          <Empty>No data yet for this range.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 12, right: 12, top: 8 }}>
              <CartesianGrid stroke="#f3f4f6" />
              <XAxis
                dataKey="t"
                tickFormatter={(t) => formatTick(t, range)}
                stroke="#9ca3af"
                fontSize={11}
                minTickGap={40}
              />
              <YAxis
                stroke="#9ca3af"
                fontSize={11}
                yAxisId="fund"
                tickFormatter={(v: number) => `$${compact(v)}`}
              />
              <YAxis
                stroke="#9ca3af"
                fontSize={11}
                yAxisId="benchmark"
                orientation="right"
                domain={["auto", "auto"]}
              />
              <Tooltip
                labelFormatter={(t) => formatTooltip(String(t), range)}
                formatter={(v: number, name) =>
                  name === "Fund" ? [`$${v.toLocaleString()}`, name] : [v.toFixed(2), name]
                }
              />
              <Legend />
              <Line
                yAxisId="fund"
                type="monotone"
                dataKey="fund"
                name="Fund"
                stroke="#111827"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="benchmark"
                type="monotone"
                dataKey="benchmark"
                name="S&P 500"
                stroke="#6b7280"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-md bg-gray-50 dark:bg-gray-800 text-sm text-gray-400 dark:text-gray-500">
      {children}
    </div>
  );
}

function formatTick(t: string, range: Range): string {
  if (range === "1D") {
    return new Date(t).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return t.slice(5); // MM-DD
}

function formatTooltip(t: string, range: Range): string {
  if (range === "1D") return new Date(t).toLocaleString();
  return t;
}

function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

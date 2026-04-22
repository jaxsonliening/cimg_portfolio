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
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                r === range
                  ? "bg-gray-900 text-white"
                  : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        {status === "error" ? (
          <Empty>Couldn&apos;t load performance data.</Empty>
        ) : data.length === 0 ? (
          <Empty>
            {status === "loading" ? "Loading…" : "No data yet for this range."}
          </Empty>
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
    <div className="flex h-full items-center justify-center rounded-md bg-gray-50 text-sm text-gray-400">
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

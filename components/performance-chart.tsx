"use client";

import { useEffect, useMemo, useState } from "react";
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
type Normalized = { t: string; cimg: number | null; spy: number | null };

const FUND_COLOR = "#6366f1"; // indigo-500 — CIMG
const BENCH_COLOR = "#f59e0b"; // amber-500 — SPY

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

  const normalized = useMemo<Normalized[]>(() => {
    if (data.length === 0) return [];
    const fundBase = firstPositive(data.map((p) => p.fund));
    const benchBase = firstPositive(
      data
        .map((p) => p.benchmark)
        .filter((v): v is number => v !== null),
    );
    return data.map((p) => ({
      t: p.t,
      cimg:
        fundBase !== null ? ((p.fund - fundBase) / fundBase) * 100 : null,
      spy:
        p.benchmark !== null && benchBase !== null
          ? ((p.benchmark - benchBase) / benchBase) * 100
          : null,
    }));
  }, [data]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">CIMG vs S&amp;P 500</h2>
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
              headers: ["Date", "CIMG (%)", "S&P 500 (%)"],
              rows: normalized.map((p) => [p.t, p.cimg, p.spy]),
            })}
          />
        </div>
      </div>

      <div className="h-96">
        {status === "error" ? (
          <Empty>Couldn&apos;t load performance data.</Empty>
        ) : status === "loading" && normalized.length === 0 ? (
          <div className="skeleton h-full w-full" aria-label="Loading performance data" />
        ) : normalized.length === 0 ? (
          <Empty>No data yet for this range.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={normalized} margin={{ left: 12, right: 12, top: 8 }}>
              <CartesianGrid
                stroke="currentColor"
                strokeOpacity={0.12}
                className="text-gray-500 dark:text-gray-400"
              />
              <XAxis
                dataKey="t"
                tickFormatter={(t) => formatTick(t, range)}
                stroke="currentColor"
                className="text-gray-500 dark:text-gray-400"
                fontSize={11}
                minTickGap={40}
              />
              <YAxis
                stroke="currentColor"
                className="text-gray-500 dark:text-gray-400"
                fontSize={11}
                tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
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
                labelFormatter={(t) => formatTooltip(String(t), range)}
                formatter={(value) => {
                  if (typeof value !== "number") return ["—"];
                  return [`${value >= 0 ? "+" : ""}${value.toFixed(2)}%`];
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="cimg"
                name="CIMG"
                stroke={FUND_COLOR}
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="spy"
                name="S&P 500"
                stroke={BENCH_COLOR}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                connectNulls
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

function firstPositive(values: number[]): number | null {
  for (const v of values) if (v > 0) return v;
  return null;
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatTick(t: string, range: Range): string {
  if (range === "1D") {
    return new Date(t).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const d = new Date(t);
  const mon = MONTH_ABBR[d.getUTCMonth()];
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${mon}-${yy}`;
}

function formatTooltip(t: string, range: Range): string {
  if (range === "1D") return new Date(t).toLocaleString();
  const d = new Date(t);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

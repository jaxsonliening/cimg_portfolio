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

const OVERLAYS = ["off", "rolling30", "alpha30"] as const;
type Overlay = (typeof OVERLAYS)[number];

const OVERLAY_LABELS: Record<Overlay, string> = {
  off: "Off",
  rolling30: "Rolling 30d",
  alpha30: "Alpha 30d",
};

const ROLLING_WINDOW = 30;

type Point = { t: string; fund: number; benchmark: number | null };
type ChartRow = {
  t: string;
  cimg: number | null;
  spy: number | null;
  overlay: number | null;
};

const FUND_COLOR = "#6366f1"; // indigo-500 — CIMG
const BENCH_COLOR = "#f59e0b"; // amber-500 — SPY
const OVERLAY_COLOR = "#14b8a6"; // teal-500 — rolling overlay

export function PerformanceChart() {
  const [range, setRange] = useState<Range>("YTD");
  const [overlay, setOverlay] = useState<Overlay>("off");
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

  const overlayDisabled = range === "1D";
  const effectiveOverlay: Overlay = overlayDisabled ? "off" : overlay;

  const rows = useMemo<ChartRow[]>(() => {
    if (data.length === 0) return [];
    const fundBase = firstPositive(data.map((p) => p.fund));
    const benchBase = firstPositive(
      data
        .map((p) => p.benchmark)
        .filter((v): v is number => v !== null),
    );
    const cimg: (number | null)[] = data.map((p) =>
      fundBase !== null ? ((p.fund - fundBase) / fundBase) * 100 : null,
    );
    const spy: (number | null)[] = data.map((p) =>
      p.benchmark !== null && benchBase !== null
        ? ((p.benchmark - benchBase) / benchBase) * 100
        : null,
    );

    const overlayValues: (number | null)[] =
      effectiveOverlay === "off"
        ? data.map(() => null)
        : effectiveOverlay === "rolling30"
          ? rollingReturn(cimg, ROLLING_WINDOW)
          : rollingAlpha(cimg, spy, ROLLING_WINDOW);

    return data.map((p, i) => ({
      t: p.t,
      cimg: cimg[i],
      spy: spy[i],
      overlay: overlayValues[i],
    }));
  }, [data, effectiveOverlay]);

  const overlayLabel = overlayLineLabel(effectiveOverlay);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">CIMG vs S&amp;P 500</h2>
        <div className="flex flex-wrap items-center gap-2">
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
          <div
            className="inline-flex items-center rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5"
            aria-label="Overlay"
            title={
              overlayDisabled
                ? "Overlay not available on 1D range"
                : "Overlay"
            }
          >
            <span className="px-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              Overlay
            </span>
            {OVERLAYS.map((o) => {
              const active = !overlayDisabled && o === overlay;
              return (
                <button
                  key={o}
                  onClick={() => {
                    if (!overlayDisabled) setOverlay(o);
                  }}
                  disabled={overlayDisabled}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                    active
                      ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  } ${overlayDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  {OVERLAY_LABELS[o]}
                </button>
              );
            })}
          </div>
          <ExportButton
            filename={`performance-${range}.csv`}
            build={() => {
              const headers = ["Date", "CIMG (%)", "S&P 500 (%)"];
              if (effectiveOverlay !== "off") {
                headers.push(`${overlayLabel} (%)`);
              }
              return {
                headers,
                rows: rows.map((p) =>
                  effectiveOverlay === "off"
                    ? [p.t, p.cimg, p.spy]
                    : [p.t, p.cimg, p.spy, p.overlay],
                ),
              };
            }}
          />
        </div>
      </div>

      <div className="h-96">
        {status === "error" ? (
          <Empty>Couldn&apos;t load performance data.</Empty>
        ) : status === "loading" && rows.length === 0 ? (
          <div className="skeleton h-full w-full" aria-label="Loading performance data" />
        ) : rows.length === 0 ? (
          <Empty>No data yet for this range.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ left: 12, right: 12, top: 8 }}>
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
              {effectiveOverlay !== "off" ? (
                <Line
                  type="monotone"
                  dataKey="overlay"
                  name={overlayLabel}
                  stroke={OVERLAY_COLOR}
                  strokeWidth={2}
                  strokeDasharray="2 3"
                  dot={false}
                  connectNulls={false}
                />
              ) : null}
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

/**
 * Rolling trailing return over `window` points on an already-normalized series
 * (where each value is % change from the range's start).
 *
 * Given the normalized series `n` (in percent) with base value 0 at index 0,
 * the underlying price ratio at index i relative to start is `1 + n[i]/100`.
 * The trailing return from i-window to i is therefore
 *   (1 + n[i]/100) / (1 + n[i-window]/100) - 1.
 *
 * Returns an array the same length as `values`, with the first `window` entries null.
 */
function rollingReturn(
  values: (number | null)[],
  window: number,
): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = window; i < values.length; i += 1) {
    const now = values[i];
    const prev = values[i - window];
    if (now === null || prev === null) continue;
    const denom = 1 + prev / 100;
    if (denom === 0) continue;
    const ratio = (1 + now / 100) / denom;
    out[i] = (ratio - 1) * 100;
  }
  return out;
}

function rollingAlpha(
  cimg: (number | null)[],
  spy: (number | null)[],
  window: number,
): (number | null)[] {
  const cimgRoll = rollingReturn(cimg, window);
  const spyRoll = rollingReturn(spy, window);
  return cimgRoll.map((c, i) => {
    const s = spyRoll[i];
    if (c === null || s === null) return null;
    return c - s;
  });
}

function overlayLineLabel(overlay: Overlay): string {
  switch (overlay) {
    case "rolling30":
      return "CIMG 30d return";
    case "alpha30":
      return "Alpha 30d";
    case "off":
      return "";
  }
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

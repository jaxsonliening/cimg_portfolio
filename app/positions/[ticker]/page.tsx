import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPositionDetail } from "@/lib/portfolio/position-detail";
import { PositionSinceChart } from "./position-since-chart";
import {
  fmtCurrency,
  fmtDateShort,
  fmtInteger,
  fmtNumber,
  fmtPctPlain,
  fmtPctSigned,
  fmtSignedCurrency,
  toneClass,
} from "@/components/format";

export const revalidate = 60;

// Dynamic route type inference expects params as a Promise in Next 16.
type Params = { ticker: string };

export default async function PositionDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { ticker } = await params;
  const supabase = await createClient();
  const detail = await getPositionDetail(supabase, ticker);
  if (!detail) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/"
        className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-gray-100"
      >
        ← Back to Portfolio
      </Link>

      <header className="mt-4 mb-8 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {detail.name}
            </h1>
            <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-sm font-semibold tracking-wide text-gray-700 dark:text-gray-300">
              {detail.ticker}
            </span>
          </div>
          {detail.committee && (
            <div className="mt-1 inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: detail.committee.color ?? "#9ca3af" }}
                aria-hidden
              />
              <span>{detail.committee.name}</span>
            </div>
          )}
        </div>
        {detail.sector && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {detail.sector}
            {detail.industry ? ` · ${detail.industry}` : ""}
          </div>
        )}
      </header>

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Current Price"
          value={fmtCurrency(detail.current_price)}
        />
        <Stat
          label="Shares Held"
          value={fmtInteger(detail.shares_held)}
        />
        <Stat
          label="Average Cost"
          value={fmtCurrency(detail.avg_cost)}
        />
        <Stat
          label="Market Value"
          value={fmtCurrency(detail.market_value)}
        />
        <Stat
          label="Unrealized P/L"
          value={fmtSignedCurrency(detail.unrealized_pnl)}
          tone={detail.unrealized_pnl}
          sublabel={
            detail.unrealized_pct !== null
              ? fmtPctSigned(detail.unrealized_pct)
              : undefined
          }
        />
        <Stat
          label="Realized P/L"
          value={
            detail.realized_pnl !== 0
              ? fmtSignedCurrency(detail.realized_pnl)
              : "—"
          }
          tone={detail.realized_pnl !== 0 ? detail.realized_pnl : undefined}
        />
        <Stat
          label="Dividends Received"
          value={fmtCurrency(detail.total_dividends)}
        />
        <Stat
          label="Target Weight"
          value={fmtPctPlain(detail.target_weight, 1)}
        />
      </section>

      {detail.initial_purchase && (
        <section className="mb-8 rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm sm:p-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-medium">
              {detail.ticker} vs S&amp;P 500 Since {fmtDateShort(detail.initial_purchase)}
            </h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Price only
            </span>
          </div>
          <PositionSinceChart data={detail.chart} ticker={detail.ticker} />
        </section>
      )}

      <section className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <div className="border-b border-gray-100 dark:border-gray-800 px-5 py-3.5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
              Analyst Data
            </h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            <Row label="Intrinsic Value" value={fmtCurrency(detail.intrinsic_value)} />
            <Row label="V/P" value={fmtNumber(detail.v_over_p, 2)} />
            <Row
              label="Last Reviewed"
              value={fmtDateShort(
                detail.value_updated_at?.slice(0, 10) ?? null,
              )}
            />
            <Row label="Market Cap" value={fmtCompactCurrency(detail.market_cap)} />
            <Row label="P/E Ratio" value={fmtNumber(detail.pe_ratio, 2)} />
            <Row label="EPS" value={fmtCurrency(detail.eps)} />
            <Row
              label="Dividend Yield"
              value={fmtPctPlain(detail.dividend_yield, 2)}
            />
          </div>
        </div>

        {detail.thesis && (
          <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
            <div className="border-b border-gray-100 dark:border-gray-800 px-5 py-3.5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                Thesis
              </h2>
            </div>
            <div className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {detail.thesis}
            </div>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
          Lot History ({detail.lots.length})
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-left text-[11px] uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">Purchased</th>
                <th className="px-4 py-2 text-right font-medium">Shares</th>
                <th className="px-4 py-2 text-right font-medium">Cost Basis</th>
                <th className="px-4 py-2 text-right font-medium">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {detail.lots.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                    {fmtDateShort(l.purchased_at)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmtInteger(l.shares)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmtCurrency(l.cost_basis)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmtInteger(l.remaining_shares)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detail.trades.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
            Sell Trades ({detail.trades.length})
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-left text-[11px] uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">Shares</th>
                  <th className="px-4 py-2 text-right font-medium">Price</th>
                  <th className="px-4 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {detail.trades.map((t, i) => (
                  <tr key={`${t.traded_at}-${i}`}>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                      {fmtDateShort(t.traded_at)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtInteger(t.shares)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtCurrency(t.price)}
                    </td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                      {t.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {detail.dividends.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
            Dividends ({detail.dividends.length})
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-left text-[11px] uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {detail.dividends.map((d, i) => (
                  <tr key={`${d.occurred_at}-${i}`}>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                      {fmtDateShort(d.occurred_at)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtCurrency(d.amount)}
                    </td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                      {d.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  sublabel,
  tone,
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: number | null;
}) {
  const valueTone = tone !== undefined ? toneClass(tone) : "text-gray-900 dark:text-gray-100";
  return (
    <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueTone}`}>
        {value}
      </div>
      {sublabel && (
        <div className={`mt-0.5 text-[11px] tabular-nums ${tone !== undefined ? toneClass(tone) : "text-gray-500 dark:text-gray-400"}`}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 text-sm">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span className="tabular-nums text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}

function fmtCompactCurrency(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

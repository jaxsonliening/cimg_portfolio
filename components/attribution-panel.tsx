import type { PortfolioSummary, PositionRow } from "@/lib/portfolio/types";
import { fmtPctSigned, fmtSignedCurrency, toneClass } from "./format";

// "Where is our return coming from?" The dashboard's summary panel
// shows aggregate P&L; this card breaks it down three ways so the PM
// can answer the classic attribution question without a spreadsheet:
//
//   - Top contributors: five positions with the largest positive
//     unrealized P&L, as a share of the full portfolio.
//   - Top detractors: five with the most negative.
//   - By committee: net unrealized P&L per committee, sorted by size.
//
// Contribution is expressed as percentage points of the portfolio,
// so the numbers sum (approximately) to the total unrealized return.
// Rendered as a single three-column card — each column is a compact
// list, easy to scan and resize-friendly on mobile (stacks vertically
// under sm).

type CommitteeLine = {
  name: string;
  color: string | null;
  pnl: number;
  contribution: number;
};

export function AttributionPanel({
  positions,
  summary,
}: {
  positions: PositionRow[];
  summary: PortfolioSummary;
}) {
  const portfolioValue = summary.market_value_portfolio;
  if (positions.length === 0 || portfolioValue <= 0) {
    return null;
  }

  const withContribution = positions
    .filter((p) => p.unrealized_pnl !== null)
    .map((p) => ({
      ...p,
      pnl: p.unrealized_pnl as number,
      contribution: (p.unrealized_pnl as number) / portfolioValue,
    }));

  const contributors = [...withContribution]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5);
  const detractors = [...withContribution]
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, 5);

  const byCommittee = new Map<string, CommitteeLine>();
  for (const p of withContribution) {
    if (!p.committee) continue;
    const key = p.committee.id;
    const existing = byCommittee.get(key);
    if (existing) {
      existing.pnl += p.pnl;
      existing.contribution += p.contribution;
    } else {
      byCommittee.set(key, {
        name: p.committee.name,
        color: p.committee.color,
        pnl: p.pnl,
        contribution: p.contribution,
      });
    }
  }
  const committees = Array.from(byCommittee.values()).sort(
    (a, b) => b.contribution - a.contribution,
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm transition-shadow hover:shadow-md">
      <div className="border-b border-gray-100 dark:border-gray-800 px-5 py-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
          Attribution
        </h2>
        <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
          Unrealized P&amp;L as a share of total portfolio value
        </p>
      </div>
      <div className="grid grid-cols-1 divide-y divide-gray-100 dark:divide-gray-800 md:grid-cols-3 md:divide-x md:divide-y-0">
        <ContributorsList
          title="Top Contributors"
          rows={contributors}
          glyph="▲"
          tone="up"
        />
        <ContributorsList
          title="Top Detractors"
          rows={detractors}
          glyph="▼"
          tone="down"
        />
        <CommitteeList rows={committees} />
      </div>
    </div>
  );
}

function ContributorsList({
  title,
  rows,
  glyph,
  tone,
}: {
  title: string;
  rows: (PositionRow & { pnl: number; contribution: number })[];
  glyph: string;
  tone: "up" | "down";
}) {
  const toneClassName =
    tone === "up"
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-rose-700 dark:text-rose-400";
  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
        <span className={toneClassName}>{glyph}</span>
        <span>{title}</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-gray-500">—</div>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((p) => (
            <li key={p.ticker} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-900 dark:text-gray-100">
                  {p.name}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  {p.ticker} · {fmtSignedCurrency(p.pnl)}
                </div>
              </div>
              <div
                className={`shrink-0 tabular-nums font-semibold ${toneClass(
                  p.contribution,
                )}`}
              >
                {fmtPctSigned(p.contribution)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommitteeList({ rows }: { rows: CommitteeLine[] }) {
  return (
    <div className="px-5 py-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
        By Committee
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-gray-500">—</div>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color ?? "#9ca3af" }}
                  aria-hidden
                />
                <span className="truncate text-gray-800 dark:text-gray-200">
                  {c.name}
                </span>
              </div>
              <div
                className={`shrink-0 tabular-nums font-semibold ${toneClass(
                  c.contribution,
                )}`}
              >
                {fmtPctSigned(c.contribution)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

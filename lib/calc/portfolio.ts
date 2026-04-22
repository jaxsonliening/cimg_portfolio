export type OpenPosition = {
  ticker: string;
  committee_id: string;
  shares: number;
};

export type CommitteeRow = {
  id: string;
  name: string;
  color: string;
  display_order: number;
};

export type CommitteeAllocation = {
  id: string;
  name: string;
  color: string;
  value: number;
  pct: number;
};

/**
 * For each committee, sum (shares × latest price) across its open positions.
 * Returns allocations ordered by display_order; pct is that committee's
 * share of the total (not the total including cash — that's done separately
 * in the summary endpoint).
 */
export function computeCommitteeAllocations(
  committees: CommitteeRow[],
  positions: OpenPosition[],
  latestPrices: ReadonlyMap<string, number>,
): { allocations: CommitteeAllocation[]; total: number } {
  const valueByCommittee = new Map<string, number>();

  for (const p of positions) {
    const price = latestPrices.get(p.ticker) ?? 0;
    const value = p.shares * price;
    valueByCommittee.set(
      p.committee_id,
      (valueByCommittee.get(p.committee_id) ?? 0) + value,
    );
  }

  const total = Array.from(valueByCommittee.values()).reduce(
    (acc, v) => acc + v,
    0,
  );

  const allocations = [...committees]
    .sort((a, b) => a.display_order - b.display_order)
    .map((c) => {
      const value = valueByCommittee.get(c.id) ?? 0;
      return {
        id: c.id,
        name: c.name,
        color: c.color,
        value: round2(value),
        pct: total > 0 ? value / total : 0,
      };
    });

  return { allocations, total: round2(total) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

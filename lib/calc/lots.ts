export type Lot = {
  id: string;
  ticker: string;
  shares: number;
  cost_basis: number;
  purchased_at: string;
};

export type Trade = {
  ticker: string;
  shares: number;
  price: number;
  traded_at: string;
};

export type AllocatedLot = Lot & {
  remaining_shares: number;
  realized_pnl: number; // realized on shares sold out of this lot
};

/**
 * FIFO-allocate a list of trades against a list of lots for a single ticker.
 * Lots are consumed oldest-first (by purchased_at, then created order).
 * Trades are applied in date order.
 *
 * Returns the lots augmented with remaining_shares and the realized P&L
 * attributable to each lot. Caller is expected to have pre-filtered both
 * inputs to the same ticker.
 *
 * If trades exceed available shares, the last trades partially or fully
 * consume whatever's left. No error thrown — the caller validates at write
 * time so we trust the data by read time.
 */
export function allocateTradesFifo(lots: Lot[], trades: Trade[]): AllocatedLot[] {
  const sortedLots: AllocatedLot[] = [...lots]
    .sort((a, b) => a.purchased_at.localeCompare(b.purchased_at))
    .map((l) => ({ ...l, remaining_shares: l.shares, realized_pnl: 0 }));

  const sortedTrades = [...trades].sort((a, b) =>
    a.traded_at.localeCompare(b.traded_at),
  );

  let lotIdx = 0;
  for (const trade of sortedTrades) {
    let remainingToSell = trade.shares;
    while (remainingToSell > 0 && lotIdx < sortedLots.length) {
      const lot = sortedLots[lotIdx];
      if (lot.remaining_shares <= 0) {
        lotIdx++;
        continue;
      }
      const taken = Math.min(lot.remaining_shares, remainingToSell);
      lot.remaining_shares = round4(lot.remaining_shares - taken);
      lot.realized_pnl = round2(
        lot.realized_pnl + taken * (trade.price - lot.cost_basis),
      );
      remainingToSell = round4(remainingToSell - taken);
      if (lot.remaining_shares <= 0) lotIdx++;
    }
    // If remainingToSell > 0 here, the trade oversold — data bug, ignore the excess.
  }

  return sortedLots;
}

/**
 * Given allocated lots for one ticker, compute the weighted-average cost
 * basis across the shares still held (remaining_shares). Returns null when
 * no shares remain.
 */
export function averageCostBasis(lots: AllocatedLot[]): number | null {
  let sharesHeld = 0;
  let costSum = 0;
  for (const lot of lots) {
    if (lot.remaining_shares <= 0) continue;
    sharesHeld += lot.remaining_shares;
    costSum += lot.remaining_shares * lot.cost_basis;
  }
  if (sharesHeld === 0) return null;
  return round4(costSum / sharesHeld);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

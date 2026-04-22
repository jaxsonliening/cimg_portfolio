export function fmtCurrency(n: number | null): string {
  if (n === null) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtSignedCurrency(n: number | null): string {
  if (n === null) return "—";
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtPctSigned(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct >= 0 ? "+" : "-";
  return `${sign}${(Math.abs(pct) * 100).toFixed(2)}%`;
}

export function fmtPctPlain(pct: number | null, digits = 1): string {
  if (pct === null) return "—";
  return `${(pct * 100).toFixed(digits)}%`;
}

export function fmtNumber(n: number | null, digits = 2): string {
  if (n === null) return "—";
  return n.toFixed(digits);
}

export function fmtInteger(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

export function fmtDateShort(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return "—";
  return `${m}/${d}/${y}`;
}

export function toneClass(n: number | null): string {
  if (n === null || n === 0) return "text-gray-700 dark:text-gray-300";
  return n > 0 ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500";
}

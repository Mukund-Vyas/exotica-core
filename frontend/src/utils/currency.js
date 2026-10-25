const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

// Single place money formatting lives — a future format change (thousands
// separators, currency symbol, decimals) is a one-line fix here, not a
// find-and-replace across every screen that shows a number.
export function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return formatter.format(Number(value));
}

export function formatPercent(value) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(1)}%`;
}

export function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-IN").format(Number(value));
}

/** Sum API money strings exactly (in whole paise) — floats drift: 0.1 + 0.2 !== 0.3. */
export function sumMoney(rows, key) {
  const paise = rows.reduce((acc, r) => acc + Math.round(Number(r[key] ?? 0) * 100), 0);
  return paise / 100;
}

/** Margin % from totals, or null when there is no revenue to divide by. */
export function marginOf(netProfit, revenue) {
  return Number(revenue) > 0 ? (Number(netProfit) / Number(revenue)) * 100 : null;
}

/** Tailwind class for a signed amount: losses are red (and carry a "-" sign in the text). */
export function signClass(value) {
  return Number(value) < 0 ? "text-danger" : "";
}

const costFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Per-unit costs are tracked to 4 decimals (weighted average); don't round them away on screen. */
export function formatCost(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return costFormatter.format(Number(value));
}

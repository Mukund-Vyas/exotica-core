// Sorting that understands numbers.
//
// The API returns money as strings ("-250.00", "1500.00"). TanStack's default
// "alphanumeric" sort splits strings into digit/non-digit chunks, so a loss
// ("-250.00") sorts incorrectly against profits — exactly the rows a P&L report
// most needs to surface. This compares numerically whenever both values are
// numeric, puts empty values last in both directions, and falls back to a
// case-insensitive text comparison otherwise.

const NUMERIC = /^-?\d+(\.\d+)?$/;

function asNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && NUMERIC.test(v.trim())) return Number(v);
  return null;
}

const isEmpty = (v) => v === null || v === undefined || v === "";

export function compareValues(a, b) {
  const an = asNumber(a);
  const bn = asNumber(b);
  if (an !== null && bn !== null) return an === bn ? 0 : an < bn ? -1 : 1;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

/** TanStack sortingFn: (rowA, rowB, columnId) => number. Empties sink to the bottom. */
export function smartSortingFn(rowA, rowB, columnId) {
  const a = rowA.getValue(columnId);
  const b = rowB.getValue(columnId);
  const ae = isEmpty(a);
  const be = isEmpty(b);
  if (ae || be) return ae === be ? 0 : ae ? 1 : -1;
  return compareValues(a, b);
}

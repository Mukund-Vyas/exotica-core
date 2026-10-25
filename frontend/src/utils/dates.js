// Calendar-date helpers that use the *browser's local* date.
//
// `new Date().toISOString().slice(0, 10)` converts to UTC first, so for a user in
// India (UTC+5:30) it returns yesterday's date between 00:00 and 05:30, and
// `new Date(y, m, 1).toISOString()` returns the LAST DAY OF THE PREVIOUS MONTH
// (local midnight is the previous evening in UTC). Everything date-related in the
// app goes through these instead.

const pad = (n) => String(n).padStart(2, "0");

/** Local calendar date as YYYY-MM-DD. */
export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now = new Date()) {
  return toISODate(now);
}

export function monthStartISO(now = new Date()) {
  return toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function daysAgoISO(days, now = new Date()) {
  return toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
}

/** "This month so far" range used by dashboards and report defaults. */
export function monthToDateRange(now = new Date()) {
  return { dateFrom: monthStartISO(now), dateTo: todayISO(now) };
}

/** Returns an error message if from > to, otherwise "". */
export function dateRangeError(from, to) {
  if (from && to && from > to) return "“From” must be on or before “To”.";
  return "";
}

/** Format YYYY-MM-DD for display (en-IN), without timezone shifting. */
export function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

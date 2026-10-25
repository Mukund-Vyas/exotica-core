// Parsing helpers for form inputs (all inputs arrive as strings).

/** True for strings like "3" or "12" (whole, positive). */
export function isPositiveInt(value) {
  return /^\d+$/.test(String(value ?? "").trim()) && Number(value) > 0;
}

/** True for a positive amount with at most `decimals` places, e.g. "99.5", "100". */
export function isPositiveMoney(value, decimals = 2) {
  const re = new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
  const s = String(value ?? "").trim();
  return re.test(s) && Number(s) > 0;
}

/** Money for display in an input: trims trailing zeros ("10.0000" -> "10"). */
export function trimZeros(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(Number(value));
}

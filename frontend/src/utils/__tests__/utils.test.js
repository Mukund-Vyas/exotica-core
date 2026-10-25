import { test } from "node:test";
import assert from "node:assert/strict";
import { toISODate, monthStartISO, todayISO, daysAgoISO, dateRangeError, monthToDateRange } from "../dates.js";
import { compareValues, smartSortingFn } from "../sort.js";
import { isPositiveInt, isPositiveMoney, trimZeros } from "../numbers.js";
import { newKey } from "../id.js";

test("local date helpers are not shifted by UTC conversion", () => {
  // 2026-10-01 00:30 local — the case where the old code produced 2026-09-30
  const justAfterMidnight = new Date(2026, 9, 1, 0, 30);
  assert.equal(todayISO(justAfterMidnight), "2026-10-01");
  assert.equal(monthStartISO(justAfterMidnight), "2026-10-01");
  assert.deepEqual(monthToDateRange(justAfterMidnight), { dateFrom: "2026-10-01", dateTo: "2026-10-01" });
  assert.equal(toISODate(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(daysAgoISO(31, new Date(2026, 9, 1)), "2026-08-31");
});

test("dateRangeError", () => {
  assert.equal(dateRangeError("2026-02-01", "2026-01-01") !== "", true);
  assert.equal(dateRangeError("2026-01-01", "2026-01-01"), "");
  assert.equal(dateRangeError("", "2026-01-01"), "");
});

test("numeric-aware sorting puts losses before profits", () => {
  const values = ["1500.00", "-250.00", "200.00", "-1000.00", "0.00"];
  assert.deepEqual([...values].sort(compareValues), ["-1000.00", "-250.00", "0.00", "200.00", "1500.00"]);
  // the default text-chunk comparison gets this wrong:
  assert.notDeepEqual([...values].sort((a, b) => (a < b ? -1 : 1)), [...values].sort(compareValues));
  assert.deepEqual(["b", "A", "c"].sort(compareValues), ["A", "b", "c"]);
});

test("empty values sink to the bottom", () => {
  const row = (v) => ({ getValue: () => v });
  assert.equal(smartSortingFn(row(null), row("5.00"), "c"), 1);
  assert.equal(smartSortingFn(row("5.00"), row(null), "c"), -1);
  assert.equal(smartSortingFn(row(null), row(undefined), "c"), 0);
});

test("input parsers", () => {
  assert.equal(isPositiveInt("3"), true);
  for (const bad of ["", "0", "1.5", "-2", "abc", "1e3"]) assert.equal(isPositiveInt(bad), false, bad);
  assert.equal(isPositiveMoney("99.5"), true);
  for (const bad of ["0", "0.00", "-1", "1.234", "", "x"]) assert.equal(isPositiveMoney(bad), false, bad);
  assert.equal(isPositiveMoney("1.2345", 4), true);
  assert.equal(trimZeros("10.0000"), "10");
  assert.equal(trimZeros("12.5000"), "12.5");
});

test("newKey works without crypto.randomUUID and is unique", () => {
  const keys = new Set(Array.from({ length: 500 }, newKey));
  assert.equal(keys.size, 500);
});

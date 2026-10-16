// Paid creator storage arithmetic (server/billing/policy.js): the free allowance, billable bytes, month boundaries and
// partial months, rate changes mid-month, rounding, the card minimum and carrying, and the most a limit can cost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GB, BILLING, billableBytes, usageCents, statementOf, periodOf, previousPeriod, daysInPeriod, dayOf, capBytesFor } from "../../server/billing/policy.js";

const MB = 1024 ** 2;
const FREE = 550 * MB;
const RATE = 500; // $0.05 per GB-month, the owner's proposal (not approved: tests only)
const month = (period, billable, rate = RATE, days = daysInPeriod(period)) => Array.from({ length: days }, () => ({ billable_bytes: billable, rate }));

test("nothing below the free allowance is billable, and nothing without a plan to charge", () => {
  assert.equal(billableBytes({ usedBytes: FREE, includedBytes: FREE, charged: true }), 0);
  assert.equal(billableBytes({ usedBytes: 100 * MB, includedBytes: FREE, charged: true }), 0);
  assert.equal(billableBytes({ usedBytes: FREE + GB, includedBytes: FREE, charged: true }), GB);
  assert.equal(billableBytes({ usedBytes: FREE + GB, includedBytes: FREE, charged: false }), 0);
});

test("a whole month at 1 GB over is one GB-month; 10 GB over is ten", () => {
  assert.equal(usageCents(month("2026-10", GB), "2026-10"), 5);
  assert.equal(usageCents(month("2026-10", 10 * GB), "2026-10"), 50);
  assert.equal(usageCents(month("2026-02", 10 * GB), "2026-02"), 50, "February's 28 days are a whole month too");
});

test("partial months: days without a plan or a measurement aren't charged", () => {
  // 20 GB over for 15 of October's 31 days = 20 × 15/31 GB-months = 9.677… GB-months × 5¢ = 48.39¢ → 48¢.
  assert.equal(usageCents(month("2026-10", 20 * GB, RATE, 15), "2026-10"), 48);
  assert.equal(usageCents([], "2026-10"), 0);
  assert.equal(usageCents(month("2026-10", 20 * GB, null), "2026-10"), 0, "billing off: no rate, no charge");
});

test("a rate change mid-month charges each day at its own rate", () => {
  const days = [...month("2026-11", 30 * GB, 500, 15), ...month("2026-11", 30 * GB, 1000, 15)];
  // 30 GB × (15/30 × 5¢ + 15/30 × 10¢) = 30 × 7.5¢ = 225¢.
  assert.equal(usageCents(days, "2026-11"), 225);
});

test("rounding happens once, half up, so the split of the month can't change the total", () => {
  // 1 GB for 1 day of 30 at 5¢ = 0.1667¢ → 0¢; 3 GB for that day = 0.5¢ → 1¢.
  assert.equal(usageCents([{ billable_bytes: GB, rate: RATE }], "2026-11"), 0);
  assert.equal(usageCents([{ billable_bytes: 3 * GB, rate: RATE }], "2026-11"), 1);
  const oneBig = usageCents([{ billable_bytes: 30 * GB, rate: RATE }], "2026-11");
  const manySmall = usageCents(Array.from({ length: 30 }, () => ({ billable_bytes: GB, rate: RATE })), "2026-11");
  assert.equal(oneBig, manySmall);
});

test("huge stores stay exact (no floating point)", () => {
  assert.equal(usageCents(month("2026-10", 200 * 1024 * GB), "2026-10"), 200 * 1024 * 5);
});

test("under the card minimum is carried; with the carry it's charged", () => {
  const of = (x) => { const r = statementOf(x); return [r.amount, r.status]; };
  assert.deepEqual(of({ usage: 0, carriedIn: 0 }), [0, "nothing_due"]);
  assert.deepEqual(of({ usage: 30, carriedIn: 0 }), [30, "carried"]);
  assert.deepEqual(of({ usage: 30, carriedIn: 30 }), [60, "open"]);
  assert.deepEqual(of({ usage: BILLING.minChargeCents, carriedIn: 0 }), [50, "open"]);
});

test("earnings ready to pay out settle a statement first; the card pays the rest", () => {
  assert.deepEqual(statementOf({ usage: 150, carriedIn: 0, availableEarnings: 1000 }), { total: 150, earnings: 150, amount: 0, status: "paid" });
  assert.deepEqual(statementOf({ usage: 150, carriedIn: 0, availableEarnings: 60 }), { total: 150, earnings: 60, amount: 90, status: "open" });
  assert.deepEqual(statementOf({ usage: 150, carriedIn: 0, availableEarnings: 120 }), { total: 150, earnings: 120, amount: 30, status: "carried" }, "a remainder under the minimum carries");
  assert.deepEqual(statementOf({ usage: 0, carriedIn: 0, availableEarnings: 500 }), { total: 0, earnings: 0, amount: 0, status: "nothing_due" });
  assert.equal(statementOf({ usage: 150, carriedIn: 0, availableEarnings: -5 }).earnings, 0, "a negative balance takes nothing");
});

test("periods: month boundaries in UTC, the month before January, days in a month", () => {
  assert.equal(periodOf(Date.parse("2026-10-31T23:59:59Z")), "2026-10");
  assert.equal(periodOf(Date.parse("2026-11-01T00:00:00Z")), "2026-11");
  assert.equal(dayOf(Date.parse("2026-11-01T00:00:00Z")), "2026-11-01");
  assert.equal(previousPeriod("2027-01"), "2026-12");
  assert.equal(previousPeriod("2026-10"), "2026-09");
  assert.equal(daysInPeriod("2028-02"), 29);
  assert.equal(daysInPeriod("2026-12"), 31);
});

test("a monthly spending cap buys an upload limit at the rate, so a full month at the limit costs the cap", () => {
  const limit = capBytesFor(200, FREE, RATE); // $2 at $0.05 = 40 GB above the free storage
  assert.equal(limit, FREE + 40 * GB);
  const days = Array.from({ length: 30 }, () => ({ billable_bytes: billableBytes({ usedBytes: limit, includedBytes: FREE, charged: true }), rate: RATE }));
  assert.equal(usageCents(days, "2026-11"), 200);
});

// When a counter-notice's content may come back (server/copyright/business-days.js): 11 US business days after it
// arrives, skipping weekends and federal holidays (with their observed days), so never before the 10 the law asks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { afterBusinessDays, holidays } from "../../server/copyright/business-days.js";

test("weekends and holidays don't count; around Christmas and New Year it waits longer (security review)", () => {
  assert.equal(afterBusinessDays(Date.parse("2026-10-20T12:00:00Z")), "2026-11-05T00:00:00.000Z");
  assert.equal(afterBusinessDays(Date.parse("2026-12-18T15:00:00Z")), "2027-01-07T00:00:00.000Z");
  const h = holidays(2027);
  assert.ok(h.has(Date.UTC(2027, 6, 5)), "4 July 2027 is a Sunday, observed Monday the 5th");
  assert.ok(h.has(Date.UTC(2027, 10, 25)), "Thanksgiving, fourth Thursday of November");
  assert.ok(h.has(Date.UTC(2027, 11, 31)), "1 January 2028 is a Saturday, observed Friday 31 December");
});

// The budget guard's pure parts (server/usage/usage.js) and the settings it keeps (server/settings/settings.js): what a
// job costs, which month it is, and that only valid override months and caps can be stored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { jobCost, monthOf, ALLOWANCE, JOB_OVERHEAD_MS, UNKNOWN_JOB_MS } from "../../server/usage/usage.js";
import { SETTINGS } from "../../server/settings/settings.js";

test("a job costs its time plus a start-up per attempt, and two writes per stored file", () => {
  assert.deepEqual(jobCost({ wallMs: 1000, attempts: 1, files: 3 }), { container_ms: 1000 + JOB_OVERHEAD_MS, class_a: 8 });
  assert.equal(jobCost({ wallMs: 1000, attempts: 3 }).container_ms, 1000 + 3 * JOB_OVERHEAD_MS);
  // No recorded time (it failed every retry): counted as a long job, never as free.
  assert.equal(jobCost({ wallMs: null, attempts: 0 }).container_ms, UNKNOWN_JOB_MS + JOB_OVERHEAD_MS);
  assert.equal(ALLOWANCE.container_ms, 25 * 3600 * 1000);
});

test("months are UTC", () => {
  assert.equal(monthOf(Date.parse("2026-10-31T23:59:59Z")), "2026-10");
  assert.equal(monthOf(Date.parse("2026-11-01T00:00:00Z")), "2026-11");
});

test("only a month or none can allow spending; the cap is a whole number of GB", () => {
  const { usage_override: o, storage_cap_gb: c } = SETTINGS;
  for (const v of ["none", "2026-10", "2027-01"]) assert.ok(o.valid(v), v);
  for (const v of ["", "2026-13", "2026-1", "always", "2026-10x"]) assert.ok(!o.valid(v), v);
  for (const v of ["1", "9", "9999"]) assert.ok(c.valid(v), v);
  for (const v of ["0", "1.5", "-1", "10000", "09"]) assert.ok(!c.valid(v), v);
});

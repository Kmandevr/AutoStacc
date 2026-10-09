// Rate-limit counters (server/lib/ratelimit.js): purging deletes only counters older than a day, so /privacy's "deleted
// within a day" holds and no live window (six hours at most) is cut short.
import { test } from "node:test";
import assert from "node:assert/strict";
import { purgeRateLimits, RETENTION_MS } from "../../server/lib/ratelimit.js";

test("purge deletes counters idle for more than a day, nothing newer", async () => {
  let seen;
  const db = { prepare: (q) => ({ bind: (...a) => ({ run: async () => { seen = { q, a }; return { meta: { changes: 0 } }; } }) }) };
  const now = Date.UTC(2026, 9, 9);
  await purgeRateLimits(db, now);
  assert.match(seen.q, /^DELETE FROM rateLimit WHERE lastRequest < \?$/);
  assert.deepEqual(seen.a, [now - RETENTION_MS]);
  assert.ok(RETENTION_MS >= 6 * 3600 * 1000, "longer than the longest limit window");
});

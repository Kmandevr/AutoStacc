// Per-client request limits for store endpoints (Better Auth limits its own). Counts live in the rateLimit table that
// Better Auth already uses, under "gs:" keys, as one atomic upsert per request. The client is Cloudflare's
// CF-Connecting-IP (set by Cloudflare, not by the browser); it is only used as a counter key, never stored elsewhere.
// Counters older than a day are deleted now and then (no window is longer than six hours), Better Auth's own included,
// so an IP address is kept for at most a day after its last limited request (/privacy says so).
import { fail } from "./http.js";
import { newId } from "./db.js";

export const RETENTION_MS = 24 * 3600 * 1000;
const PURGE_CHANCE = 0.01;

// Deletes stale counters. Run in the background on about one limited request in a hundred; also callable directly.
export const purgeRateLimits = (db, nowMs = Date.now()) =>
  db.prepare("DELETE FROM rateLimit WHERE lastRequest < ?").bind(nowMs - RETENTION_MS).run();

// by: count per something other than the client (an account or a creator id), for limits that must hold whatever the
// address (invitation emails, say).
export async function limit(app, name, max, windowSeconds, { by } = {}) {
  const ip = by || app.request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const row = await app.db.prepare(
    `INSERT INTO rateLimit (id, key, count, lastRequest) VALUES (?, ?, 1, ?)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN ?3 - lastRequest > ?4 THEN 1 ELSE count + 1 END,
       lastRequest = CASE WHEN ?3 - lastRequest > ?4 THEN ?3 ELSE lastRequest END
     RETURNING count`
  ).bind(newId("rl"), `gs:${name}:${ip}`, now, windowMs).first();
  if (Math.random() < PURGE_CHANCE) {
    const purge = purgeRateLimits(app.db, now).catch((e) => console.error("rate limit purge", e));
    if (app.ctx && app.ctx.waitUntil) app.ctx.waitUntil(purge); else await purge;
  }
  if (row && row.count > max) fail(429, "rate_limited", "Too many requests. Wait a minute and try again.");
}

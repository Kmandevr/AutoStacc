// Per-client request limits for store endpoints (Better Auth limits its own). Counts live in the rateLimit table that
// Better Auth already uses, under "gs:" keys, as one atomic upsert per request. The client is Cloudflare's
// CF-Connecting-IP (set by Cloudflare, not by the browser); it is only used as a counter key, never stored elsewhere.
import { fail } from "./http.js";
import { newId } from "./db.js";

export async function limit(app, name, max, windowSeconds) {
  const ip = app.request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const row = await app.db.prepare(
    `INSERT INTO rateLimit (id, key, count, lastRequest) VALUES (?, ?, 1, ?)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN ?3 - lastRequest > ?4 THEN 1 ELSE count + 1 END,
       lastRequest = CASE WHEN ?3 - lastRequest > ?4 THEN ?3 ELSE lastRequest END
     RETURNING count`
  ).bind(newId("rl"), `gs:${name}:${ip}`, now, windowMs).first();
  if (row && row.count > max) fail(429, "rate_limited", "Too many requests. Wait a minute and try again.");
}

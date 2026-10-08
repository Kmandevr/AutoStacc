// POST /api/events: privacy-friendly analytics. Only known event names and a product/release id are accepted, and
// only a per-day counter is stored (no cookies, IPs, user ids or user agents). Fails silently for the browser.
import { json, readJson } from "../lib/http.js";
import { run } from "../lib/db.js";
import { limit } from "../lib/ratelimit.js";
import { hasImpersonationCookie } from "../impersonation/sessions.js";

export const EVENTS = new Set(["release_view", "product_view", "preview_play", "add_to_cart", "checkout_start", "purchase_complete", "download_request",
  "page_view", "project_view", "news_view"]);
const SUBJECT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function record(app) {
  await limit(app, "events", 120, 60);
  const body = await readJson(app.request, 1024);
  const event = String(body.event || "");
  const subject = typeof body.subject === "string" && SUBJECT.test(body.subject) && body.subject.length <= 80 ? body.subject : "";
  // An admin browsing as a customer is not a visitor: accepted, not counted.
  if (!EVENTS.has(event) || hasImpersonationCookie(app.request)) return json({ ok: false }, 202);
  await run(app.db,
    `INSERT INTO analytics_daily (day, event, subject, count) VALUES (?, ?, ?, 1)
     ON CONFLICT (day, event, subject) DO UPDATE SET count = count + 1`,
    new Date().toISOString().slice(0, 10), event, subject);
  return json({ ok: true }, 202);
}

export const routes = [["POST", "/api/events", record, { impersonation: "allow" }]];

// GET /api/admin/stats: the admin statistics, as sections of typed metrics (server/stats/metric.js). Admin only.
// ?days=1..365 (default 30) and ?mode=live|test (default: what this store takes). A new section is a file exporting
// { id, title, metrics(q) } and a line in SECTIONS; the admin page draws whatever comes back. Every query is
// bounded by date and indexed (db/migrations/0004_admin_ops.sql); test/api/stats.suite.js checks their query plans.
import { json, fail, str } from "../lib/http.js";
import { requireAdmin } from "../auth/session.js";
import { paymentProvider } from "../payments/index.js";
import sales from "./sales.js";
import customers from "./customers.js";
import products from "./products.js";
import downloads from "./downloads.js";
import activity from "./activity.js";

export const SECTIONS = [sales, customers, products, downloads, activity];

function range(app) {
  const url = new URL(app.request.url);
  const days = Math.max(1, Math.min(Number(url.searchParams.get("days")) || 30, 365));
  const live = paymentProvider(app).livemode(app.config);
  const mode = url.searchParams.get("mode") ? str(url.searchParams.get("mode"), "mode", { pattern: /^(live|test)$/ }) : live ? "live" : "test";
  const untilDay = new Date().toISOString().slice(0, 10);
  const sinceDay = new Date(Date.parse(untilDay) - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { days, mode, live: mode === "live" ? 1 : 0, since: sinceDay + "T00:00:00.000Z", sinceDay, untilDay, storeIsLive: live };
}

async function compute(app, sections) {
  await requireAdmin(app);
  const r = range(app);
  const q = { db: app.db, ...r };
  const out = await Promise.all(sections.map(async (s) => ({ id: s.id, title: s.title, metrics: await s.metrics(q) })));
  return json({ days: r.days, since: r.sinceDay, until: r.untilDay, mode: r.mode, storeIsLive: r.storeIsLive, generatedAt: new Date().toISOString(), sections: out });
}

async function one(app, { section }) {
  const s = SECTIONS.find((x) => x.id === section);
  if (!s) {
    await requireAdmin(app);
    fail(404, "not_found", "No statistics section with that name.");
  }
  return compute(app, [s]);
}

export const routes = [
  ["GET", "/api/admin/stats", (app) => compute(app, SECTIONS)],
  ["GET", "/api/admin/stats/:section", one]
];

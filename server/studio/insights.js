// Studio API, a product's Insights (docs/studio.md): the last 30, 90 or 365 days against the period before, a row per
// day, how each sale did, and the daily rows as CSV. Owners and editors may read it; the platform fee and the creator's
// share are the owner's only (null for editors). Views are the existing anonymous per-day counters; traffic sources
// aren't tracked. Reads: server/studio/insights-data.js.
import { json, fail } from "../lib/http.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { requireOwnProduct } from "../creators/products.js";
import { saleLabels } from "../promotions/creator-sales.js";
import { readRange, summarise, dayOf } from "./insights-data.js";

const DAY = 86400000;
const RANGES = [30, 90, 365];
const MONEY_PRIVATE = ["platformFeeCents", "creatorShareCents"];
const COLUMNS = ["day", "orders", "units", "grossCents", "discountCents", "netCents", "platformFeeCents", "creatorShareCents", "refundsCents", "freeClaims", "downloads", "views"];

const hide = (row, owner) => (owner ? row : { ...row, ...Object.fromEntries(MONEY_PRIVATE.map((k) => [k, null])) });
const withConversion = (t) => ({ ...t, conversion: t.views > 0 ? Math.round((t.orders / t.views) * 10000) / 10000 : null });

// Orders and money taken off per sale in the period, from each line's sale id (list price minus what was charged).
async function salesOf(db, lines) {
  const by = new Map();
  for (const l of lines) {
    if (!l.sale_id) continue;
    const s = by.get(l.sale_id) || { saleId: l.sale_id, orders: 0, units: 0, discountCents: 0 };
    s.orders += 1; s.units += l.quantity;
    s.discountCents += Math.max(0, ((l.list_price_cents ?? l.unit_price_cents) - l.unit_price_cents) * l.quantity);
    by.set(l.sale_id, s);
  }
  const labels = await saleLabels(db, [...by.keys()]);
  return [...by.values()].map((s) => ({ ...s, ...(labels.get(s.saleId) || { name: "Ended sale", creator: false, percentOff: null, amountOffCents: null }) }))
    .sort((a, b) => b.orders - a.orders);
}

const csvCell = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

async function insights(app, { productId }) {
  const user = await requireUser(app);
  await limit(app, "studio-insights", 300, 3600);
  const { product, role } = await requireOwnProduct(app.db, productId, user);
  const q = new URL(app.request.url).searchParams;
  const days = Number(q.get("days") || 30);
  if (!RANGES.includes(days)) fail(400, "invalid_field", "days is 30, 90 or 365.", { field: "days" });
  const format = q.get("format") || "json";
  if (!["json", "csv"].includes(format)) fail(400, "invalid_field", "format is json or csv.", { field: "format" });
  const owner = role === "owner";
  // Whole UTC days ending today: [until - days, until), and the same length before it.
  const until = new Date(Date.parse(dayOf(new Date().toISOString())) + DAY);
  const since = new Date(until.getTime() - days * DAY);
  const before = new Date(since.getTime() - days * DAY);
  const [cur, prev] = await Promise.all([readRange(app, product.id, since, until), readRange(app, product.id, before, since)]);
  const now = summarise(cur, since, until);
  const daily = now.daily.map((d) => hide(d, owner));
  if (format === "csv") {
    const body = [COLUMNS.join(","), ...daily.map((d) => COLUMNS.map((c) => csvCell(d[c])).join(","))].join("\r\n") + "\r\n";
    return new Response(body, { status: 200, headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${product.id}-insights-${days}d.csv"`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex", "Referrer-Policy": "same-origin"
    } });
  }
  return json({
    range: { days, from: dayOf(since.toISOString()), to: dayOf(new Date(until.getTime() - DAY).toISOString()),
      previousFrom: dayOf(before.toISOString()), previousTo: dayOf(new Date(since.getTime() - DAY).toISOString()) },
    totals: hide(withConversion(now.totals), owner),
    previous: hide(withConversion(summarise(prev, before, since).totals), owner),
    daily,
    sales: await salesOf(app.db, cur.lines),
    tracked: { views: true, traffic: false }
  });
}

export const routes = [["GET", "/api/studio/products/:productId/insights", insights]];

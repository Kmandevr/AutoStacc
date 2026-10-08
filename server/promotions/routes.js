// Admin API for sales and promo codes (owner only, 404 to everyone else). List with status and usage, create, end.
// A promotion isn't edited once created: end it and create another, so every order points at the terms it got.
// Changes are recorded in the audit log. Pricing rules: server/promotions/promotions.js.
import { json, fail, readJson, str, int } from "../lib/http.js";
import { all, first, run, newId, now, parseJson } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { getProducts } from "../catalog/products.js";
import { audit } from "../audit/log.js";
import { CODE, normalizeCode } from "./promotions.js";
import { paymentProvider } from "../payments/index.js";

const status = (p, t) => (p.ends_at && p.ends_at <= t ? "ended" : p.starts_at > t ? "scheduled" : "running");
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?Z$/;
const time = (v, name) => {
  const s = str(v, name, { max: 30, pattern: ISO });
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) fail(400, "invalid_field", `${name} isn't a date.`);
  return d.toISOString();
};

async function list(app) {
  await requireAdmin(app);
  const t = now();
  // Usage counts this store's own kind of orders: live orders in a live store, test orders in a test store.
  const live = paymentProvider(app).livemode(app.config) ? 1 : 0;
  const [rows, codeUse, saleUse] = await Promise.all([
    all(app.db, "SELECT * FROM promotions ORDER BY created_at DESC LIMIT 200"),
    all(app.db, `SELECT promotion_id AS id, COUNT(*) AS orders, SUM(discount_cents) AS cents FROM orders
      WHERE promotion_id IS NOT NULL AND status = 'paid' AND livemode = ? GROUP BY promotion_id`, live),
    all(app.db, `SELECT i.sale_id AS id, COUNT(DISTINCT o.id) AS orders, SUM((i.list_price_cents - i.unit_price_cents) * i.quantity) AS cents
      FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.sale_id IS NOT NULL AND o.status = 'paid' AND o.livemode = ? GROUP BY i.sale_id`, live)
  ]);
  const use = new Map([...codeUse, ...saleUse].map((u) => [u.id, u]));
  return json({
    promotions: rows.map((p) => ({
      id: p.id, kind: p.kind, name: p.name, code: p.code, percentOff: p.percent_off, amountOffCents: p.amount_off_cents, currency: p.currency,
      scope: p.scope, scopeIds: parseJson(p.scope_ids, []), startsAt: p.starts_at, endsAt: p.ends_at, maxRedemptions: p.max_redemptions,
      oncePerCustomer: Boolean(p.once_per_customer), status: status(p, t), paidOrders: (use.get(p.id) || {}).orders || 0, discountCents: (use.get(p.id) || {}).cents || 0
    }))
  });
}

async function create(app) {
  const admin = await requireAdmin(app);
  const b = await readJson(app.request);
  const kind = str(b.kind, "kind", { pattern: /^(sale|code)$/ });
  const name = str(b.name, "name", { max: 80 }).trim();
  const code = kind === "code" ? normalizeCode(b.code) : null;
  if (kind === "code" && !CODE.test(code)) fail(400, "invalid_field", "Codes are 3–32 letters, numbers, - or _.");
  const percent = b.percentOff != null && b.percentOff !== "" ? int(b.percentOff, "percentOff", { min: 1, max: 90 }) : null;
  const amount = b.amountOffCents != null && b.amountOffCents !== "" ? int(b.amountOffCents, "amountOffCents", { min: 1, max: 1000000 }) : null;
  if ((percent === null) === (amount === null)) fail(400, "invalid_field", "Give either a percentage (1–90) or an amount off, not both.");
  const currency = str(b.currency || "USD", "currency", { pattern: /^[A-Z]{3}$/ });
  const scope = str(b.scope || "all", "scope", { pattern: /^(all|products|project)$/ });
  const ids = scope === "all" ? [] : Array.isArray(b.scopeIds) ? [...new Set(b.scopeIds.map((x) => str(x, "scopeIds", { max: 80, pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/ })))] : [];
  if (scope !== "all" && !ids.length) fail(400, "invalid_field", "Pick what it applies to.");
  if (scope === "products" && (await getProducts(app.db, ids)).length !== ids.length) fail(400, "invalid_field", "Unknown product in the list.");
  if (scope === "project" && (await all(app.db, `SELECT id FROM projects WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids)).length !== ids.length) {
    fail(400, "invalid_field", "Unknown project in the list.");
  }
  const startsAt = b.startsAt ? time(b.startsAt, "startsAt") : now();
  const endsAt = b.endsAt ? time(b.endsAt, "endsAt") : null;
  if (endsAt && endsAt <= startsAt) fail(400, "invalid_field", "It has to end after it starts.");
  const max = kind === "code" && b.maxRedemptions != null && b.maxRedemptions !== "" ? int(b.maxRedemptions, "maxRedemptions", { min: 1, max: 1000000 }) : null;
  const once = kind === "code" && b.oncePerCustomer === true;
  const id = newId("promo");
  const t = now();
  try {
    await run(app.db,
      `INSERT INTO promotions (id, kind, name, code, percent_off, amount_off_cents, currency, scope, scope_ids, starts_at, ends_at, max_redemptions,
        once_per_customer, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, kind, name, code, percent, amount, currency, scope, JSON.stringify(ids), startsAt, endsAt, max, once ? 1 : 0, admin.id, t, t);
  } catch (e) {
    if (/UNIQUE/.test(String(e.message))) fail(409, "code_taken", "That code already exists (codes are never reused).");
    throw e;
  }
  await audit(app, "promotion.created", { targetType: "promotion", targetId: id,
    detail: { kind, name, code, percentOff: percent, amountOffCents: amount, scope, scopeIds: ids, startsAt, endsAt, maxRedemptions: max, oncePerCustomer: once } });
  return json({ ok: true, id }, 201);
}

// Ends it now (or cancels it before it starts). Orders already placed keep what they got.
async function end(app, { promotionId }) {
  await requireAdmin(app);
  const p = await first(app.db, "SELECT * FROM promotions WHERE id = ?", str(promotionId, "promotionId", { max: 40, pattern: /^promo_[a-z2-7]+$/ }));
  if (!p) fail(404, "not_found", "No promotion with that id.");
  const t = now();
  if (status(p, t) === "ended") return json({ ok: true, status: "ended" });
  await run(app.db, "UPDATE promotions SET ends_at = ?, updated_at = ? WHERE id = ?", t, t, p.id);
  await audit(app, "promotion.ended", { targetType: "promotion", targetId: p.id, detail: { name: p.name, code: p.code, wasStatus: status(p, t) } });
  return json({ ok: true, status: "ended" });
}

export const routes = [
  ["GET", "/api/admin/promotions", list],
  ["POST", "/api/admin/promotions", create],
  ["POST", "/api/admin/promotions/:promotionId/end", end]
];

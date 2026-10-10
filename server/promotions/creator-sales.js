// Creators' own sales (docs/studio.md, "Pricing"): an ordinary promotions sale scoped to one product, marked with the
// creator's id, so the cart, checkout and order history treat it like any other (server/cart/pricing.js combines prices).
// One running or scheduled sale per product at a time, enforced inside the insert; never edited, only ended (a running
// one ends now) or deleted before it starts, so every order keeps the terms it got. The Studio route is
// server/studio/pricing.js; it calls these and nothing else touches creators' rows.
import { all, first, run, newId, now } from "../lib/db.js";
import { fail, str, int } from "../lib/http.js";

export const CREATOR_SALE = { minPercent: 1, maxPercent: 90, maxDays: 90, pastSlackMinutes: 5 };
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?Z$/;
const DAY = 86400000;

export const saleStatus = (p, t = now()) => (p.ends_at && p.ends_at <= t ? "ended" : p.starts_at > t ? "scheduled" : "running");
const scopeOf = (productId) => JSON.stringify([productId]);
const OPEN = "kind = 'sale' AND creator_id IS NOT NULL AND scope = 'products' AND scope_ids = ? AND (ends_at IS NULL OR ends_at > ?)";

function time(v, name) {
  const d = new Date(str(v, name, { max: 30, pattern: ISO }));
  if (Number.isNaN(d.getTime())) fail(400, "invalid_field", `${name} isn't a date.`, { field: name });
  return d;
}

/** Checks a creator's sale request against a product's list price: { percentOff, amountOffCents, startsAt, endsAt }. */
export function cleanSaleInput(body, priceCents, nowMs = Date.now()) {
  if (!(priceCents > 0)) fail(400, "free_product", "A free product can't have a sale.");
  const has = (k) => body[k] != null && body[k] !== "";
  if (has("percentOff") === has("amountOffCents")) fail(400, "invalid_field", "Give either a percentage (1–90) or an amount off, not both.");
  const percentOff = has("percentOff") ? int(body.percentOff, "percentOff", { min: CREATOR_SALE.minPercent, max: CREATOR_SALE.maxPercent }) : null;
  const amountOffCents = has("amountOffCents") ? int(body.amountOffCents, "amountOffCents", { min: 1, max: 1000000 }) : null;
  if (amountOffCents !== null && amountOffCents >= priceCents) fail(400, "invalid_field", "The amount off must be less than the price.", { field: "amountOffCents" });
  let start = has("startsAt") ? time(body.startsAt, "startsAt") : new Date(nowMs);
  if (start.getTime() < nowMs - CREATOR_SALE.pastSlackMinutes * 60000) fail(400, "invalid_field", "A sale can't start in the past.", { field: "startsAt" });
  if (start.getTime() < nowMs) start = new Date(nowMs);
  const end = has("endsAt") ? time(body.endsAt, "endsAt") : null;
  if (end && end <= start) fail(400, "invalid_field", "It has to end after it starts.", { field: "endsAt" });
  if (end && end.getTime() - start.getTime() > CREATOR_SALE.maxDays * DAY) fail(400, "invalid_field", `A sale can last up to ${CREATOR_SALE.maxDays} days.`, { field: "endsAt" });
  return { percentOff, amountOffCents, startsAt: start.toISOString(), endsAt: end ? end.toISOString() : null };
}

/** A product's creator sales, newest first (ended ones too, for the history). */
export const listCreatorSales = (db, { productId, creatorId }) => all(db,
  "SELECT * FROM promotions WHERE creator_id = ? AND kind = 'sale' AND scope = 'products' AND scope_ids = ? ORDER BY created_at DESC LIMIT 50",
  creatorId, scopeOf(productId));

/** Creates one; 409 sale_exists when another is running or scheduled (checked in the insert, so races can't make two). */
export async function createCreatorSale(db, { product, creatorId, userId, sale }) {
  const id = newId("promo");
  const t = now();
  const res = await run(db,
    `INSERT INTO promotions (id, kind, name, code, percent_off, amount_off_cents, currency, scope, scope_ids, starts_at, ends_at, max_redemptions,
      once_per_customer, created_by, created_at, updated_at, creator_id)
     SELECT ?, 'sale', ?, NULL, ?, ?, ?, 'products', ?, ?, ?, NULL, 0, ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM promotions WHERE ${OPEN})`,
    id, `${product.title}`.slice(0, 80), sale.percentOff, sale.amountOffCents, product.currency, scopeOf(product.id), sale.startsAt, sale.endsAt,
    userId, t, t, creatorId, scopeOf(product.id), t);
  if (!res.meta.changes) fail(409, "sale_exists", "This product already has a sale running or scheduled. End it first.");
  return first(db, "SELECT * FROM promotions WHERE id = ?", id);
}

/** Ends a creator sale of this product: deleted when it hasn't started, else it ends now. 404 for anything else. */
export async function endCreatorSale(db, { product, creatorId, saleId }) {
  const p = typeof saleId === "string" && /^promo_[a-z2-7]+$/.test(saleId)
    ? await first(db, "SELECT * FROM promotions WHERE id = ? AND creator_id = ? AND kind = 'sale' AND scope_ids = ?", saleId, creatorId, scopeOf(product.id)) : null;
  if (!p) fail(404, "not_found", "No such sale.");
  const t = now();
  const was = saleStatus(p, t);
  if (was === "ended") return { sale: p, was, changed: false };
  // Compare-and-set: a scheduled sale that started meanwhile isn't deleted, it is ended like a running one.
  if (was === "scheduled" && (await run(db, "DELETE FROM promotions WHERE id = ? AND starts_at > ?", p.id, t)).meta.changes) return { sale: p, was, changed: true };
  const res = await run(db, "UPDATE promotions SET ends_at = ?, updated_at = ? WHERE id = ? AND (ends_at IS NULL OR ends_at > ?)", t, t, p.id, t);
  return { sale: p, was: "running", changed: Boolean(res.meta.changes) };
}

/** Names and owners of sales by id, for a product's sales performance (Insights): Map id → { name, creator }. */
export async function saleLabels(db, ids) {
  if (!ids.length) return new Map();
  const rows = await all(db, `SELECT id, name, creator_id, percent_off, amount_off_cents FROM promotions WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  return new Map(rows.map((r) => [r.id, { name: r.name, creator: Boolean(r.creator_id), percentOff: r.percent_off || null, amountOffCents: r.amount_off_cents || null }]));
}

// Sales and promo codes: which ones are running, what they take off, and how a code's discount is shared across an
// order's lines. Pure rules plus a few reads; prices still come from the catalog, and server/cart/pricing.js is the
// only place they're combined. Floors: a sale never makes a paid product cheaper than 50 cents, and a code never
// takes an order below 50 cents (Stripe's minimum charge); giving something away is an entitlement grant instead.
import { all, first, now, parseJson } from "../lib/db.js";

export const MIN_CHARGE_CENTS = 50;
export const CODE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
export const normalizeCode = (s) => String(s || "").trim().toUpperCase();

const RUNNING = "starts_at <= ? AND (ends_at IS NULL OR ends_at > ?)";
// A use: paid or refunded, or another signed-in account still at the payment page. The same rule as the
// promotions_limit trigger (db/migrations/0005_promotions.sql), which says why guests' pending orders don't count.
const USES = `promotion_id = ? AND (status IN ('paid', 'refunded') OR (status = 'pending' AND user_id IS NOT NULL AND user_id IS NOT ? AND created_at > ?))`;
const pendingSince = () => new Date(Date.now() - 35 * 60000).toISOString();

export const runningSales = (db, at = now()) => all(db, `SELECT * FROM promotions WHERE kind = 'sale' AND ${RUNNING}`, at, at);

export function appliesTo(promo, product) {
  if (promo.scope === "all") return true;
  const ids = parseJson(promo.scope_ids, []);
  return promo.scope === "products" ? ids.includes(product.id) : ids.includes(product.project_id);
}

const off = (promo, cents) => (promo.percent_off ? Math.floor((cents * promo.percent_off) / 100) : promo.amount_off_cents);

// The best running sale for one product: { priceCents, sale } (sale null when none applies).
export function salePrice(product, sales) {
  const list = product.price_cents;
  let best = { priceCents: list, sale: null };
  if (list <= 0) return best;
  for (const s of sales) {
    if (s.currency !== product.currency || !appliesTo(s, product)) continue;
    const price = Math.max(list - off(s, list), Math.min(list, MIN_CHARGE_CENTS));
    if (price < best.priceCents) best = { priceCents: price, sale: s };
  }
  return best;
}

// A code the buyer typed: the running promotion, or why not ("invalid", which covers not started yet, or "ended").
export async function findCode(db, raw) {
  const code = normalizeCode(raw);
  const p = CODE.test(code) ? await first(db, "SELECT * FROM promotions WHERE kind = 'code' AND code = ?", code) : null;
  const t = now();
  // A code that hasn't started answers like one that doesn't exist, so scheduled codes can't be found early.
  if (!p || p.starts_at > t) return { problem: "invalid" };
  if (p.ends_at && p.ends_at <= t) return { problem: "ended" };
  return { promo: p };
}

// Soft checks for the cart page; the database enforces both again when the order is written.
// The buyer's own unpaid orders never count against them (they reuse them, or abandoned them).
export async function usageProblem(db, promo, { email = "", userId = null } = {}) {
  if (promo.max_redemptions) {
    const used = await first(db, `SELECT COUNT(*) AS n FROM orders WHERE ${USES}`, promo.id, userId, pendingSince());
    if (used.n >= promo.max_redemptions) return "used_up";
  }
  if (promo.once_per_customer && email) {
    const mine = await first(db, "SELECT COUNT(*) AS n FROM orders WHERE promotion_id = ? AND email = ? AND status IN ('paid', 'refunded')", promo.id, email);
    if (mine.n) return "already_used";
  }
  return null;
}

// How much a code takes off these priced lines, and each line's share (largest remainder, so shares add up exactly).
export function codeDiscount(promo, lines, products, totalCents) {
  const eligible = lines.filter((l) => !l.problem && !l.held && l.currency === promo.currency && appliesTo(promo, products.get(l.productId)));
  const base = eligible.reduce((s, l) => s + l.lineTotalCents, 0);
  if (!base) return { discountCents: 0, shares: new Map() };
  const discountCents = Math.max(0, Math.min(off(promo, base), base, totalCents - MIN_CHARGE_CENTS));
  const raw = eligible.map((l) => ({ id: l.productId, exact: (discountCents * l.lineTotalCents) / base }));
  const shares = new Map(raw.map((r) => [r.id, Math.floor(r.exact)]));
  let left = discountCents - [...shares.values()].reduce((s, n) => s + n, 0);
  for (const r of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (left <= 0) break;
    shares.set(r.id, shares.get(r.id) + 1);
    left--;
  }
  return { discountCents, shares };
}

// What a browser may see of a running promotion.
export const publicPromotion = (p) => ({ name: p.name, code: p.code || null, percentOff: p.percent_off || null, amountOffCents: p.amount_off_cents || null, endsAt: p.ends_at || null });

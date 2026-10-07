// Orders: creation, lookups and status changes. A status change is a compare-and-set (UPDATE ... WHERE status IN
// allowed-from), so two events racing for the same order can't both win and a refunded order can't become paid again.
import { all, first, run, stmt, newId, now } from "../lib/db.js";

// Allowed moves. A verified payment wins over an earlier failure or expiry: the money was taken, so the order is paid.
export const TRANSITIONS = {
  paid: ["pending", "failed", "cancelled"],
  failed: ["pending"],
  cancelled: ["pending"],
  refunded: ["paid"]
};

export async function createOrder(db, { userId, email, currency, items, provider, livemode, idempotencyKey, accessKeyHash }) {
  const id = newId("ord");
  const t = now();
  const subtotal = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  await db.batch([
    stmt(db,
      `INSERT INTO orders (id, user_id, email, status, currency, subtotal_cents, discount_cents, total_cents, provider, livemode,
        idempotency_key, access_key_hash, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      id, userId, email, currency, subtotal, subtotal, provider, livemode ? 1 : 0, idempotencyKey, accessKeyHash, t, t),
    ...items.map((i) => stmt(db,
      `INSERT INTO order_items (id, order_id, product_id, title, unit_price_cents, quantity, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      newId("oi"), id, i.productId, i.title, i.unitPriceCents, i.quantity, i.unitPriceCents * i.quantity))
  ]);
  return getOrder(db, id);
}

export const getOrder = (db, id) => first(db, "SELECT * FROM orders WHERE id = ?", id);
export const getOrderBySession = (db, provider, sessionId) =>
  first(db, "SELECT * FROM orders WHERE provider = ? AND provider_session_id = ?", provider, sessionId);
export const getOrderByPayment = (db, provider, paymentId) =>
  first(db, "SELECT * FROM orders WHERE provider = ? AND provider_payment_id = ?", provider, paymentId);
export const getOrderByIdempotencyKey = (db, key) => first(db, "SELECT * FROM orders WHERE idempotency_key = ?", key);
export const orderItems = (db, orderId) =>
  all(db, "SELECT product_id, title, unit_price_cents, quantity, line_total_cents FROM order_items WHERE order_id = ? ORDER BY title", orderId);

export const attachCheckout = (db, id, sessionId, url) =>
  run(db, "UPDATE orders SET provider_session_id = ?, checkout_url = ?, updated_at = ? WHERE id = ? AND status = 'pending'", sessionId, url, now(), id);

// Returns true if this call moved the order (false: it was already there or the move isn't allowed).
export async function transition(db, id, to, fields = {}) {
  const from = TRANSITIONS[to];
  if (!from) throw new Error(`No transition to ${to}`);
  const t = now();
  const extra = { ...fields, ...(to === "paid" ? { paid_at: t } : {}), ...(to !== "paid" ? { closed_at: t } : {}) };
  const sets = Object.keys(extra).map((k) => `${k} = ?`);
  const res = await run(db,
    `UPDATE orders SET status = ?, updated_at = ?${sets.length ? ", " + sets.join(", ") : ""}
     WHERE id = ? AND status IN (${from.map(() => "?").join(",")})`,
    to, t, ...Object.values(extra), id, ...from);
  return res.meta.changes === 1;
}

// A pending order this user opened recently for exactly these items: reused so a double click, a second tab or the
// back button doesn't open a second payment for the same things.
export async function findReusablePending(db, userId, items, maxAgeMinutes) {
  if (!userId) return null;
  const since = new Date(Date.now() - maxAgeMinutes * 60000).toISOString();
  const candidates = await all(db,
    "SELECT * FROM orders WHERE user_id = ? AND status = 'pending' AND checkout_url IS NOT NULL AND created_at > ? ORDER BY created_at DESC LIMIT 5",
    userId, since);
  const want = items.map((i) => `${i.productId}x${i.quantity}`).sort().join(",");
  for (const o of candidates) {
    const have = (await orderItems(db, o.id)).map((i) => `${i.product_id}x${i.quantity}`).sort().join(",");
    if (have === want) return o;
  }
  return null;
}

// Browser-safe view of an order.
export const publicOrder = (o, items) => ({
  id: o.id,
  status: o.status,
  email: o.email,
  currency: o.currency,
  subtotalCents: o.subtotal_cents,
  totalCents: o.total_cents,
  createdAt: o.created_at,
  paidAt: o.paid_at,
  items: (items || []).map((i) => ({ productId: i.product_id, title: i.title, unitPriceCents: i.unit_price_cents, quantity: i.quantity, lineTotalCents: i.line_total_cents }))
});

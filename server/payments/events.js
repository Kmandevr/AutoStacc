// The one place payment outcomes change orders. Input is a provider-neutral event that was already verified (a
// signed Stripe webhook, a Stripe API lookup made with our secret key, or a dev-only mock). Guards, in order:
//   1. each event id is processed once (payment_events primary key); a failed attempt can be retried
//   2. the event must match its order: same provider, same session/payment, same order id, same live/test mode
//   3. a payment must match the order's total and currency to the cent
//   4. status moves are compare-and-set (server/orders/orders.js), so racing events can't double-apply
import { first, run, now } from "../lib/db.js";
import { getOrderBySession, getOrderByPayment, transition } from "../orders/orders.js";
import { fulfil, unfulfil } from "../orders/fulfilment.js";

export async function processPaymentEvent(app, ev) {
  const { db } = app;
  const claimed = await claimEvent(db, ev);
  if (!claimed) return { outcome: "duplicate" };
  let outcome;
  try {
    outcome = await apply(app, ev);
  } catch (e) {
    await finish(db, ev, "error", String(e.message || e).slice(0, 300));
    throw e;
  }
  await finish(db, ev, outcome.outcome, outcome.detail, outcome.orderId);
  return outcome;
}

// Insert the event as "processing". If it already exists it's a duplicate, unless the earlier attempt errored.
async function claimEvent(db, ev) {
  const res = await run(db,
    `INSERT INTO payment_events (id, provider, type, order_id, livemode, outcome, received_at) VALUES (?, ?, ?, ?, ?, 'processing', ?)
     ON CONFLICT (id) DO UPDATE SET outcome = 'processing', received_at = excluded.received_at WHERE payment_events.outcome = 'error'`,
    `${ev.provider}:${ev.id}`, ev.provider, ev.rawType || ev.type, ev.orderId || null, ev.livemode ? 1 : 0, now());
  return res.meta.changes === 1;
}

const finish = (db, ev, outcome, detail = null, orderId = null) =>
  run(db, "UPDATE payment_events SET outcome = ?, detail = ?, order_id = COALESCE(?, order_id) WHERE id = ?",
    outcome, detail, orderId, `${ev.provider}:${ev.id}`);

const reject = (detail, orderId = null) => ({ outcome: "rejected", detail, orderId });

async function apply(app, ev) {
  const { db } = app;
  if (["ignored", "awaiting", "pending"].includes(ev.type)) return { outcome: "ignored", detail: ev.type };

  const order = ev.type === "refunded" || ev.type === "partial_refund"
    ? ev.paymentId && (await getOrderByPayment(db, ev.provider, ev.paymentId))
    : ev.sessionId && (await getOrderBySession(db, ev.provider, ev.sessionId));
  if (!order) return reject("no matching order");
  if (ev.orderId && ev.orderId !== order.id) return reject("order id mismatch", order.id);
  if (Boolean(order.livemode) !== Boolean(ev.livemode)) return reject("live/test mode mismatch", order.id);

  switch (ev.type) {
    case "paid": {
      if (ev.amount !== order.total_cents || String(ev.currency).toUpperCase() !== order.currency) return reject("amount mismatch", order.id);
      const moved = await transition(db, order.id, "paid", { provider_payment_id: ev.paymentId || null });
      // Grants are idempotent, so they run on every paid event; the email only when this event made the sale.
      const fresh = await first(db, "SELECT status FROM orders WHERE id = ?", order.id);
      if (fresh.status !== "paid") return reject(`order is ${fresh.status}`, order.id);
      await fulfil(app, order.id, { notify: moved });
      return { outcome: moved ? "paid" : "already paid", orderId: order.id };
    }
    case "failed":
      return { outcome: (await transition(db, order.id, "failed")) ? "failed" : `no change (${order.status})`, orderId: order.id };
    case "expired":
      return { outcome: (await transition(db, order.id, "cancelled")) ? "cancelled" : `no change (${order.status})`, orderId: order.id };
    case "refunded": {
      const moved = await transition(db, order.id, "refunded");
      if (moved || order.status === "refunded") await unfulfil(app, order.id, "refunded");
      return { outcome: moved ? "refunded" : `no change (${order.status})`, orderId: order.id };
    }
    case "partial_refund":
      // Access stays: a partial refund is a goodwill gesture. Revoke by hand in the admin if needed.
      return { outcome: "partial refund noted", orderId: order.id };
    default:
      return { outcome: "ignored", detail: ev.type };
  }
}

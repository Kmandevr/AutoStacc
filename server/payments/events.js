// The one place payment outcomes change orders. Input is a provider-neutral event that was already verified (a
// signed Stripe webhook, a Stripe API lookup made with our secret key, or a dev-only mock). Guards, in order:
//   1. each event id is processed once (payment_events primary key); a failed attempt can be retried
//   2. the event must match its order: same provider, same session/payment, same order id, same live/test mode
//   3. a payment must match the order's total and currency to the cent
//   4. status moves are compare-and-set (server/orders/orders.js), so racing events can't double-apply
import { first, run, now } from "../lib/db.js";
import { getOrderBySession, getOrderByPayment, transition, recordRefund } from "../orders/orders.js";
import { fulfil, unfulfil, restore } from "../orders/fulfilment.js";
import { sendEmail } from "../email/index.js";

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
  // Money was taken but the store refused the event (amount, mode or order mismatch): the owner must look.
  if (outcome.outcome === "rejected" && ev.type === "paid") await alertAdmins(app, ev, outcome);
  return outcome;
}

// Insert the event as "processing". If it already exists it's a duplicate, unless the earlier attempt errored or died
// mid-way (still "processing" after 5 minutes: the Worker was stopped), in which case this delivery retries it.
async function claimEvent(db, ev) {
  const stale = new Date(Date.now() - 5 * 60000).toISOString();
  const res = await run(db,
    `INSERT INTO payment_events (id, provider, type, order_id, livemode, outcome, received_at) VALUES (?, ?, ?, ?, ?, 'processing', ?)
     ON CONFLICT (id) DO UPDATE SET outcome = 'processing', received_at = excluded.received_at
     WHERE payment_events.outcome = 'error' OR (payment_events.outcome = 'processing' AND payment_events.received_at < ?)`,
    `${ev.provider}:${ev.id}`, ev.provider, ev.rawType || ev.type, ev.orderId || null, ev.livemode ? 1 : 0, now(), stale);
  return res.meta.changes === 1;
}

const finish = (db, ev, outcome, detail = null, orderId = null) =>
  run(db, "UPDATE payment_events SET outcome = ?, detail = ?, order_id = COALESCE(?, order_id) WHERE id = ?",
    outcome, detail, orderId, `${ev.provider}:${ev.id}`);

async function alertAdmins(app, ev, outcome) {
  for (const to of app.config.adminEmails) {
    await sendEmail(app, "payment-rejected", to, { provider: ev.provider, eventId: ev.id, sessionId: ev.sessionId, orderId: outcome.orderId, reason: outcome.detail, adminUrl: `${app.config.siteUrl}/admin` },
      { dedupeKey: `payment-rejected:${ev.provider}:${ev.id}:${to}` });
  }
}

const reject = (detail, orderId = null) => ({ outcome: "rejected", detail, orderId });

async function apply(app, ev) {
  const { db } = app;
  if (["ignored", "awaiting", "pending"].includes(ev.type)) return { outcome: "ignored", detail: ev.type };

  const order = ["refunded", "partial_refund", "disputed", "dispute_won"].includes(ev.type)
    ? ev.paymentId && (await getOrderByPayment(db, ev.provider, ev.paymentId))
    : ev.sessionId && (await getOrderBySession(db, ev.provider, ev.sessionId));
  if (!order) {
    // A refund can beat its payment (webhooks arrive in any order). Park it by payment id; the paid event applies it.
    if (ev.type === "refunded" && ev.paymentId) return { outcome: "refund waiting for payment", detail: ev.paymentId };
    if (ev.type === "disputed" && ev.paymentId) return { outcome: "dispute waiting for payment", detail: ev.paymentId };
    return reject("no matching order");
  }
  if (ev.orderId && ev.orderId !== order.id) return reject("order id mismatch", order.id);
  if (Boolean(order.livemode) !== Boolean(ev.livemode)) return reject("live/test mode mismatch", order.id);

  switch (ev.type) {
    case "paid": {
      if (ev.amount !== order.total_cents || String(ev.currency).toUpperCase() !== order.currency) return reject("amount mismatch", order.id);
      const moved = await transition(db, order.id, "paid", { provider_payment_id: ev.paymentId || null });
      const fresh = await first(db, "SELECT status FROM orders WHERE id = ?", order.id);
      if (fresh.status !== "paid") return reject(`order is ${fresh.status}`, order.id);
      // A refund or chargeback that arrived before this payment: apply it now instead of granting.
      const parked = ev.paymentId && await first(db,
        "SELECT outcome FROM payment_events WHERE provider = ? AND detail = ? AND outcome IN ('refund waiting for payment', 'dispute waiting for payment') LIMIT 1",
        ev.provider, ev.paymentId);
      if (parked) {
        if (parked.outcome.startsWith("refund")) {
          await transition(db, order.id, "refunded");
          await recordRefund(db, order.id, order.total_cents, true);
        }
        await unfulfil(app, order.id, parked.outcome.startsWith("refund") ? "refunded" : "disputed");
        await run(db, "UPDATE payment_events SET outcome = REPLACE(outcome, 'waiting for payment', 'applied'), order_id = ? WHERE provider = ? AND detail = ? AND outcome LIKE '%waiting for payment'",
          order.id, ev.provider, ev.paymentId);
        return { outcome: `paid, then ${parked.outcome.split(" ")[0]} (arrived first)`, orderId: order.id };
      }
      // Grants and the receipt are idempotent (the receipt has a once-per-order key), so every paid event runs them:
      // a retry after a failure half-way still finishes the job.
      await fulfil(app, order.id);
      return { outcome: moved ? "paid" : "already paid", orderId: order.id };
    }
    case "failed":
      return { outcome: (await transition(db, order.id, "failed")) ? "failed" : `no change (${order.status})`, orderId: order.id };
    case "expired":
      return { outcome: (await transition(db, order.id, "cancelled")) ? "cancelled" : `no change (${order.status})`, orderId: order.id };
    case "refunded": {
      const moved = await transition(db, order.id, "refunded");
      if (moved || order.status === "refunded") await recordRefund(db, order.id, ev.amount ?? order.total_cents, true);
      if (moved || order.status === "refunded") await unfulfil(app, order.id, "refunded");
      return { outcome: moved ? "refunded" : `no change (${order.status})`, orderId: order.id };
    }
    // Chargeback opened: access goes until it's resolved. Won: access comes back. Lost: stays revoked.
    case "disputed":
      await unfulfil(app, order.id, "disputed");
      return { outcome: "disputed, access suspended", orderId: order.id };
    case "dispute_won":
      if (order.status === "paid") await restore(app, order.id);
      return { outcome: "dispute won, access restored", orderId: order.id };
    case "partial_refund":
      // Access stays: a partial refund is a goodwill gesture. Revoke by hand in the admin if needed.
      await recordRefund(db, order.id, ev.amount, false);
      return { outcome: "partial refund noted", orderId: order.id };
    default:
      return { outcome: "ignored", detail: ev.type };
  }
}

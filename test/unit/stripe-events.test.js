// Stripe events map to the store's provider-neutral outcomes; anything unexpected is ignored, never treated as paid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEvent } from "../../server/payments/stripe.js";

const session = { id: "cs_1", metadata: { order_id: "ord_1" }, payment_intent: "pi_1", amount_total: 999, currency: "usd", livemode: false };
const ev = (type, object) => ({ id: "evt_1", type, livemode: false, data: { object } });

test("payment outcomes", () => {
  assert.equal(normalizeEvent(ev("checkout.session.completed", { ...session, payment_status: "paid" })).type, "paid");
  assert.equal(normalizeEvent(ev("checkout.session.completed", { ...session, payment_status: "unpaid" })).type, "awaiting");
  assert.equal(normalizeEvent(ev("checkout.session.async_payment_succeeded", session)).type, "paid");
  assert.equal(normalizeEvent(ev("checkout.session.async_payment_failed", session)).type, "failed");
  assert.equal(normalizeEvent(ev("checkout.session.expired", session)).type, "expired");
  const paid = normalizeEvent(ev("checkout.session.completed", { ...session, payment_status: "paid" }));
  assert.deepEqual([paid.orderId, paid.sessionId, paid.paymentId, paid.amount, paid.currency], ["ord_1", "cs_1", "pi_1", 999, "USD"]);
});

test("refunds and unknown events", () => {
  assert.equal(normalizeEvent(ev("charge.refunded", { payment_intent: "pi_1", refunded: true, amount_refunded: 999, currency: "usd" })).type, "refunded");
  assert.equal(normalizeEvent(ev("charge.refunded", { payment_intent: "pi_1", refunded: false, amount_refunded: 1, currency: "usd" })).type, "partial_refund");
  for (const t of ["payment_intent.succeeded", "charge.succeeded", "customer.created", "invoice.paid"]) assert.equal(normalizeEvent(ev(t, session)).type, "ignored", t);
});

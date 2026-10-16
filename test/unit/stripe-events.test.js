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

test("disputes: opened, won, and lost or closed are each recognized and tied to the payment", () => {
  const d = (type, status) => normalizeEvent(ev(type, { id: "dp_1", payment_intent: "pi_1", status }));
  assert.equal(d("charge.dispute.created", "needs_response").type, "disputed");
  assert.equal(d("charge.dispute.closed", "won").type, "dispute_won");
  const lost = d("charge.dispute.closed", "lost");
  assert.deepEqual([lost.type, lost.paymentId, lost.disputeStatus], ["dispute_lost", "pi_1", "lost"]);
  assert.equal(d("charge.dispute.closed", "warning_closed").type, "dispute_lost");
  assert.equal(normalizeEvent(ev("charge.dispute.closed", { id: "dp_1", status: "lost" })).paymentId, null);
});

test("refunds are recorded before tax and never above the order total (#129)", async () => {
  const { preTaxRefund } = await import("../../server/payments/events.js");
  const order = { total_cents: 1000 };
  assert.equal(preTaxRefund(order, { amount: 1070, chargedAmount: 1070 }), 1000, "full refund of a taxed charge");
  assert.equal(preTaxRefund(order, { amount: 535, chargedAmount: 1070 }), 500, "half of it");
  assert.equal(preTaxRefund(order, { amount: 300, chargedAmount: 1000 }), 300, "untaxed: as given");
  assert.equal(preTaxRefund(order, { amount: 300 }), 300, "no charged amount (mock): as given");
  assert.equal(preTaxRefund(order, { amount: 5000 }), 1000, "never above the order total");
  assert.equal(normalizeEvent({ id: "evt", type: "charge.refunded", livemode: false, data: { object: { refunded: true, amount: 1070, amount_refunded: 1070, currency: "usd", payment_intent: "pi" } } }).chargedAmount, 1070);
});

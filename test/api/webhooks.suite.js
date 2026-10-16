// Stripe webhooks: only correctly signed, fresh, matching events change anything; duplicates and replays are no-ops;
// cancellations, failures and refunds move orders and access the right way; racing events can't double-apply.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, unique, sendWebhook, signedEvent, outbox, sql } from "../support/client.js";
import { WEBHOOK_SECRET } from "../support/servers.js";
import { stripeCheckout, stripePay, sessionEvent, eventId } from "../support/flows.js";

export default (ctx) => describe("webhooks", () => {
  const buyer = async (tag) => {
    const c = new Client(ctx.stripe.url);
    const email = unique(tag);
    const order = await stripeCheckout(c, [{ productId: "stems-patchwork" }], { email });
    return { c, email, order };
  };
  const status = async (c, id) => (await c.get(`/api/orders/${id}`)).data.order.status;
  const owned = async (c) => (await c.get("/api/library")).data.items.map((i) => i.productId);

  test("a verified payment marks the order paid, grants access and sends one receipt", async () => {
    const { c, email, order } = await buyer("paid");
    const { res } = await stripePay(ctx, c, order);
    assert.equal(res.status, 200);
    assert.equal(res.data.outcome, "paid");
    assert.equal(await status(c, order.orderId), "paid");
    assert.deepEqual(await owned(c), ["stems-patchwork"]);
    assert.equal((await outbox(ctx.stripe.url, email)).filter((m) => m.kind === "purchase-confirmation").length, 1);
  });

  test("unsigned, mis-signed and wrong-secret events are refused", async () => {
    const { c, order } = await buyer("forged");
    const session = ctx.stripe.fake.pay(order.sessionId);
    const ev = sessionEvent("checkout.session.completed", session);
    const raw = JSON.stringify(ev);
    const post = (headers) => c.req("POST", "/api/webhooks/stripe", { raw, headers: { "Content-Type": "application/json", ...headers } });
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ "stripe-signature": "t=1,v1=deadbeef" })).status, 400);
    assert.equal((await sendWebhook(c, ev, "whsec_someone_elses_secret")).status, 400);
    // Signed for one body, sent with another (amount edited after signing).
    const { header } = signedEvent(ev, WEBHOOK_SECRET);
    const edited = raw.replace(/"amount_subtotal":\d+/, '"amount_subtotal":1');
    assert.equal((await c.req("POST", "/api/webhooks/stripe", { raw: edited, headers: { "stripe-signature": header, "Content-Type": "application/json" } })).status, 400);
    assert.equal(await status(c, order.orderId), "pending");
    assert.deepEqual(await owned(c), []);
  });

  test("an old event (replayed later) is refused by its timestamp", async () => {
    const { c, order } = await buyer("replay-old");
    const session = ctx.stripe.fake.pay(order.sessionId);
    const res = await sendWebhook(c, sessionEvent("checkout.session.completed", session), WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600);
    assert.equal(res.status, 400);
    assert.equal(await status(c, order.orderId), "pending");
  });

  test("the same event delivered twice is applied once", async () => {
    const { c, email, order } = await buyer("dupe");
    const { ev } = await stripePay(ctx, c, order);
    const again = await sendWebhook(c, ev, WEBHOOK_SECRET);
    assert.equal(again.status, 200);
    assert.equal(again.data.outcome, "duplicate");
    assert.equal((await outbox(ctx.stripe.url, email)).filter((m) => m.kind === "purchase-confirmation").length, 1);
    assert.equal(sql(ctx.stripe.stateDir, `SELECT COUNT(*) AS n FROM entitlements WHERE source_id = '${order.orderId}'`)[0].n, 1);
  });

  test("the same payment under a new event id grants nothing extra", async () => {
    const { c, order } = await buyer("second-id");
    const { session } = await stripePay(ctx, c, order);
    const res = await sendWebhook(c, sessionEvent("checkout.session.completed", session), WEBHOOK_SECRET);
    assert.equal(res.data.outcome, "already paid");
    assert.equal(sql(ctx.stripe.stateDir, `SELECT COUNT(*) AS n FROM entitlements WHERE source_id = '${order.orderId}'`)[0].n, 1);
  });

  test("ten copies of one event racing in are applied once", async () => {
    const { c, order } = await buyer("race");
    const session = ctx.stripe.fake.pay(order.sessionId);
    const ev = sessionEvent("checkout.session.completed", session);
    const results = await Promise.all(Array.from({ length: 10 }, () => sendWebhook(c, ev, WEBHOOK_SECRET)));
    assert.equal(results.filter((r) => r.data.outcome === "paid").length, 1);
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(sql(ctx.stripe.stateDir, `SELECT COUNT(*) AS n FROM entitlements WHERE source_id = '${order.orderId}'`)[0].n, 1);
  });

  test("signed events that don't match the order are rejected", async () => {
    const cases = [
      ["amount", { amount_subtotal: 1, amount_total: 1 }],
      ["currency", { currency: "eur" }],
      ["order id", { metadata: { order_id: "ord_aaaaaaaaaaaaaaaaaaaaaaaaaa" }, client_reference_id: "ord_aaaaaaaaaaaaaaaaaaaaaaaaaa" }],
      ["live mode", { livemode: true }],
      ["unknown session", { id: "cs_test_never_created" }]
    ];
    for (const [name, overrides] of cases) {
      const { c, order } = await buyer("mismatch");
      const { res } = await stripePay(ctx, c, order, { overrides });
      assert.equal(res.status, 200, name); // acknowledged so Stripe stops retrying...
      assert.equal(res.data.outcome, "rejected", name); // ...but nothing happens
      assert.equal(await status(c, order.orderId), "pending", name);
      assert.deepEqual(await owned(c), [], name);
    }
  });

  test("a completed session that isn't paid yet (bank debit) grants nothing until it settles", async () => {
    const { c, order } = await buyer("async");
    const session = { ...ctx.stripe.fake.sessions.get(order.sessionId), payment_status: "unpaid", status: "complete" };
    const first = await sendWebhook(c, sessionEvent("checkout.session.completed", session), WEBHOOK_SECRET);
    assert.equal(first.data.outcome, "ignored");
    assert.equal(await status(c, order.orderId), "pending");
    const failed = await sendWebhook(c, sessionEvent("checkout.session.async_payment_failed", session), WEBHOOK_SECRET);
    assert.equal(failed.data.outcome, "failed");
    assert.equal(await status(c, order.orderId), "failed");
    assert.deepEqual(await owned(c), []);
  });

  test("an abandoned checkout is cancelled and never owned", async () => {
    const { c, order } = await buyer("expired");
    const session = ctx.stripe.fake.sessions.get(order.sessionId);
    const res = await sendWebhook(c, sessionEvent("checkout.session.expired", { ...session, status: "expired" }), WEBHOOK_SECRET);
    assert.equal(res.data.outcome, "cancelled");
    assert.equal(await status(c, order.orderId), "cancelled");
    assert.deepEqual(await owned(c), []);
  });

  test("a full refund revokes access; a partial refund doesn't; a refunded order can't be paid again", async () => {
    const { c, order } = await buyer("refund");
    const { session } = await stripePay(ctx, c, order);
    const charge = (refunded, amount) => ({ id: eventId(), object: "event", type: "charge.refunded", livemode: false, created: Math.floor(Date.now() / 1000),
      data: { object: { id: "ch_x", object: "charge", payment_intent: session.payment_intent, amount: 999, amount_refunded: amount, refunded, currency: "usd" } } });
    assert.equal((await sendWebhook(c, charge(false, 300), WEBHOOK_SECRET)).data.outcome, "partial refund noted");
    assert.deepEqual(await owned(c), ["stems-patchwork"]);
    assert.equal((await sendWebhook(c, charge(true, 999), WEBHOOK_SECRET)).data.outcome, "refunded");
    assert.equal(await status(c, order.orderId), "refunded");
    assert.deepEqual(await owned(c), []);
    const late = await sendWebhook(c, sessionEvent("checkout.session.completed", session), WEBHOOK_SECRET);
    assert.equal(late.data.outcome, "rejected");
    assert.equal(await status(c, order.orderId), "refunded");
    assert.deepEqual(await owned(c), []);
  });

  // Managed Payments adds sales tax on top of the order total, and Stripe's refund amounts include it: the store records
  // the order's own (pre-tax) share, never more than the order total, so creators' shares and receipts stay right (#129).
  test("a taxed order's refunds are recorded before tax, never above the order total", async () => {
    const { c, email, order } = await buyer("refund-tax");
    const { session } = await stripePay(ctx, c, order);
    const charged = session.amount_total;
    assert.ok(charged > 999, "the fake adds tax");
    const charge = (refunded, amount) => ({ id: eventId(), object: "event", type: "charge.refunded", livemode: false, created: Math.floor(Date.now() / 1000),
      data: { object: { id: "ch_t", object: "charge", payment_intent: session.payment_intent, amount: charged, amount_refunded: amount, refunded, currency: "usd" } } });
    const refunded = () => sql(ctx.stripe.stateDir, `SELECT refunded_cents FROM orders WHERE id = '${order.orderId}'`)[0].refunded_cents;
    await sendWebhook(c, charge(false, Math.round(charged / 2)), WEBHOOK_SECRET);
    assert.equal(refunded(), Math.round((Math.round(charged / 2) * 999) / charged));
    await sendWebhook(c, charge(true, charged), WEBHOOK_SECRET);
    assert.equal(refunded(), 999);
    const mail = (await outbox(ctx.stripe.url, email)).find((m) => m.kind === "refund-confirmation");
    assert.ok(mail && /\$9\.99/.test(mail.subject + mail.body_text), "the refund email names the order's amount");
  });

  test("a late webhook is covered by reconciliation with Stripe", async () => {
    const { c, order } = await buyer("reconcile");
    ctx.stripe.fake.pay(order.sessionId); // paid at Stripe, webhook never arrives
    const r = await c.post(`/api/orders/${order.orderId}/reconcile`, {});
    assert.equal(r.data.order.status, "paid");
    assert.deepEqual(await owned(c), ["stems-patchwork"]);
    // The webhook arriving afterwards changes nothing.
    const session = ctx.stripe.fake.sessions.get(order.sessionId);
    assert.equal((await sendWebhook(c, sessionEvent("checkout.session.completed", session), WEBHOOK_SECRET)).data.outcome, "already paid");
  });

  test("a refund that arrives before its payment still wins", async () => {
    const { c, order } = await buyer("refund-first");
    const session = ctx.stripe.fake.pay(order.sessionId);
    const refund = { id: eventId(), object: "event", type: "charge.refunded", livemode: false, created: Math.floor(Date.now() / 1000),
      data: { object: { id: "ch_y", object: "charge", payment_intent: session.payment_intent, amount: 999, amount_refunded: 999, refunded: true, currency: "usd" } } };
    assert.equal((await sendWebhook(c, refund, WEBHOOK_SECRET)).data.outcome, "refund waiting for payment");
    const paid = await sendWebhook(c, sessionEvent("checkout.session.completed", session), WEBHOOK_SECRET);
    assert.match(paid.data.outcome, /refund/);
    assert.equal(await status(c, order.orderId), "refunded");
    assert.deepEqual(await owned(c), []);
    // Reconciling later can't bring it back either.
    assert.equal((await c.post(`/api/orders/${order.orderId}/reconcile`, {})).data.order.status, "refunded");
    assert.deepEqual(await owned(c), []);
  });

  test("an event whose first attempt died half-way is processed on Stripe's retry", async () => {
    const { c, order } = await buyer("crashed");
    const session = ctx.stripe.fake.pay(order.sessionId);
    const ev = sessionEvent("checkout.session.completed", session);
    sql(ctx.stripe.stateDir, `INSERT INTO payment_events (id, provider, type, livemode, outcome, received_at) VALUES ('stripe:${ev.id}', 'stripe', 'checkout.session.completed', 0, 'processing', '2000-01-01T00:00:00.000Z')`);
    assert.equal((await sendWebhook(c, ev, WEBHOOK_SECRET)).data.outcome, "paid");
    assert.deepEqual(await owned(c), ["stems-patchwork"]);
    // A fresh "processing" row (another delivery right now) is still a duplicate.
    const ev2 = sessionEvent("checkout.session.completed", session);
    sql(ctx.stripe.stateDir, `INSERT INTO payment_events (id, provider, type, livemode, outcome, received_at) VALUES ('stripe:${ev2.id}', 'stripe', 'x', 0, 'processing', '${new Date().toISOString()}')`);
    assert.equal((await sendWebhook(c, ev2, WEBHOOK_SECRET)).data.outcome, "duplicate");
  });

  test("a receipt that failed to send goes out on the next paid event", async () => {
    const { c, email, order } = await buyer("mail-retry");
    await stripePay(ctx, c, order);
    sql(ctx.stripe.stateDir, `UPDATE email_events SET status = 'failed' WHERE dedupe_key = 'purchase-confirmation:${order.orderId}'`);
    const session = ctx.stripe.fake.sessions.get(order.sessionId);
    await sendWebhook(c, sessionEvent("checkout.session.completed", session), WEBHOOK_SECRET);
    const rows = sql(ctx.stripe.stateDir, `SELECT status FROM email_events WHERE dedupe_key = 'purchase-confirmation:${order.orderId}'`);
    assert.equal(rows[0].status, "logged");
    assert.ok((await outbox(ctx.stripe.url, email)).some((m) => m.kind === "purchase-confirmation" && /#key=/.test(m.body_text)));
  });

  test("a chargeback suspends access; winning it restores access", async () => {
    const { c, order } = await buyer("dispute");
    const { session } = await stripePay(ctx, c, order);
    const dispute = (type, status) => ({ id: eventId(), object: "event", type, livemode: false, created: Math.floor(Date.now() / 1000),
      data: { object: { id: "dp_1", object: "dispute", payment_intent: session.payment_intent, status } } });
    assert.match((await sendWebhook(c, dispute("charge.dispute.created", "needs_response"), WEBHOOK_SECRET)).data.outcome, /suspended/);
    assert.deepEqual(await owned(c), []);
    assert.match((await sendWebhook(c, dispute("charge.dispute.closed", "won"), WEBHOOK_SECRET)).data.outcome, /restored/);
    assert.deepEqual(await owned(c), ["stems-patchwork"]);
  });

  test("a lost chargeback is recorded against its order without changing the order, access or earnings", async () => {
    const { c, order } = await buyer("dispute-lost");
    const { session } = await stripePay(ctx, c, order);
    const dispute = (type, status) => ({ id: eventId(), object: "event", type, livemode: false, created: Math.floor(Date.now() / 1000),
      data: { object: { id: "dp_2", object: "dispute", payment_intent: session.payment_intent, status } } });
    await sendWebhook(c, dispute("charge.dispute.created", "needs_response"), WEBHOOK_SECRET);
    const before = sql(ctx.stripe.stateDir, `SELECT status, refunded_cents FROM orders WHERE id = '${order.orderId}'`)[0];
    const ev = dispute("charge.dispute.closed", "lost");
    const res = await sendWebhook(c, ev, WEBHOOK_SECRET);
    assert.equal(res.status, 200);
    assert.match(res.data.outcome, /dispute closed/);
    const row = sql(ctx.stripe.stateDir, `SELECT order_id, type, detail FROM payment_events WHERE id = 'stripe:${ev.id}'`)[0];
    assert.deepEqual([row.order_id, row.type, row.detail], [order.orderId, "charge.dispute.closed", "dispute lost"]);
    assert.deepEqual(sql(ctx.stripe.stateDir, `SELECT status, refunded_cents FROM orders WHERE id = '${order.orderId}'`)[0], before);
    assert.equal(before.status, "paid");
    assert.deepEqual(sql(ctx.stripe.stateDir, `SELECT status, revoke_reason FROM entitlements WHERE source_id = '${order.orderId}'`).map((e) => [e.status, e.revoke_reason]), [["revoked", "disputed"]]);
    assert.deepEqual(await owned(c), []);
  });

  test("paying for a product already owned through another paid order alerts the owner once and is recorded", async () => {
    // Two tabs, two different carts both holding the same product, both paid.
    const { c, email, order } = await buyer("double");
    const second = await stripeCheckout(c, [{ productId: "stems-patchwork" }, { productId: "wallpapers" }], { email });
    await stripePay(ctx, c, order);
    const { ev, res } = await stripePay(ctx, c, second);
    assert.equal(res.data.outcome, "paid");
    const row = sql(ctx.stripe.stateDir, `SELECT detail FROM payment_events WHERE id = 'stripe:${ev.id}'`)[0];
    assert.match(row.detail, new RegExp(`double purchase: stems-patchwork \\(also in ${order.orderId}\\)`));
    assert.doesNotMatch(row.detail, /wallpapers/);
    // A retry of the same payment under a new event id doesn't alert again.
    await sendWebhook(c, sessionEvent("checkout.session.completed", ctx.stripe.fake.sessions.get(second.sessionId)), WEBHOOK_SECRET);
    const alerts = (await outbox(ctx.stripe.url, "admin@autostacc.test")).filter((m) => m.kind === "admin-alert" && m.body_text.includes(second.orderId));
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].body_text, new RegExp(`double purchase of .* by order ${second.orderId}`, "i"));
    assert.ok(!(await outbox(ctx.stripe.url, email)).some((m) => m.kind === "admin-alert"), "the buyer gets no alert");
    // The first order alone raised nothing.
    const first = sql(ctx.stripe.stateDir, `SELECT detail FROM payment_events WHERE order_id = '${order.orderId}' AND type = 'checkout.session.completed'`)[0];
    assert.equal(first.detail, null);
  });

  test("a refused paid event alerts the owner", async () => {
    const { c, order } = await buyer("alert");
    await stripePay(ctx, c, order, { overrides: { amount_subtotal: 5, amount_total: 5 } });
    const mails = await outbox(ctx.stripe.url, "admin@autostacc.test");
    assert.ok(mails.some((m) => m.kind === "payment-rejected" && m.body_text.includes("amount mismatch")));
  });
});

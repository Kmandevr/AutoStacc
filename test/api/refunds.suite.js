// Customer refunds (server/orders/refunds.js): a paid order, inside 14 days, with nothing downloaded from it, is
// refunded by the customer themselves, and everything else (downloaded, too old, someone else's, unpaid, twice) is refused.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql, unique, outbox, sendWebhook } from "../support/client.js";
import { WEBHOOK_SECRET } from "../support/servers.js";
import { newBuyer, mockBuy, stripeCheckout, stripePay, eventId } from "../support/flows.js";

export default (ctx) => describe("refunds", () => {
  const owned = async (c) => (await c.get("/api/library")).data.items.map((i) => i.productId);
  const refund = (c, orderId) => c.post(`/api/orders/${orderId}/refund`, {});

  test("an unused paid order is refunded by its buyer; the files leave their library; a second try is refused", async () => {
    const { c, user } = await newBuyer(ctx.mock.url, "rf-ok");
    const order = await mockBuy(c, [{ productId: "serum-presets" }]);
    const before = await c.get(`/api/orders/${order.orderId}`);
    assert.equal(before.data.order.refund.eligible, true);
    assert.deepEqual(await owned(c), ["serum-presets"]);
    const r = await refund(c, order.orderId);
    assert.equal(r.status, 200);
    assert.equal(r.data.order.status, "refunded");
    assert.deepEqual(await owned(c), []);
    const again = await refund(c, order.orderId);
    assert.equal(again.status, 409);
    assert.equal(again.data.error.code, "not_refundable");
    const mails = (await outbox(ctx.mock.url, user.email)).filter((m) => m.kind === "refund-confirmation");
    assert.equal(mails.length, 1, "one refund confirmation, however often it's asked");
    assert.match(mails[0].body_text, new RegExp(order.orderId));
  });

  test("anything downloaded from the order can't be refunded here", async () => {
    const { c } = await newBuyer(ctx.mock.url, "rf-dl");
    const order = await mockBuy(c, [{ productId: "serum-presets" }]);
    assert.equal((await c.post("/api/downloads", { fileId: ctx.fileIdFor("serum-presets") })).status, 200);
    const r = await refund(c, order.orderId);
    assert.equal(r.status, 409);
    assert.equal(r.data.error.reason ?? r.data.error.details?.reason, "downloaded");
    assert.equal((await c.get(`/api/orders/${order.orderId}`)).data.order.status, "paid");
    assert.deepEqual(await owned(c), ["serum-presets"]);
  });

  test("not after 14 days, not someone else's order, not signed out, not an unpaid one", async () => {
    const { c } = await newBuyer(ctx.mock.url, "rf-old");
    const order = await mockBuy(c, [{ productId: "serum-presets" }]);
    const stranger = await newBuyer(ctx.mock.url, "rf-stranger");
    assert.equal((await refund(stranger.c, order.orderId)).status, 404);
    assert.equal((await refund(new Client(ctx.mock.url), order.orderId)).status, 404);
    sql(ctx.mock.stateDir, `UPDATE orders SET paid_at = '${new Date(Date.now() - 15 * 86400000).toISOString()}' WHERE id = '${order.orderId}'`);
    const r = await refund(c, order.orderId);
    assert.equal(r.status, 409);
    assert.equal((await c.get(`/api/orders/${order.orderId}`)).data.order.status, "paid");
    const pending = await c.post("/api/checkout", { items: [{ productId: "sample-pack-vol1" }] });
    assert.equal((await refund(c, pending.data.orderId)).status, 409, "an unpaid order has nothing to refund");
  });

  test("the order says why it can't be refunded here: expired, free (no payment) or downloaded", async () => {
    const { c } = await newBuyer(ctx.mock.url, "rf-reasons");
    const reason = async (id) => (await c.get(`/api/orders/${id}`)).data.order.refund;
    const old = await mockBuy(c, [{ productId: "serum-presets" }]);
    sql(ctx.mock.stateDir, `UPDATE orders SET paid_at = '${new Date(Date.now() - 15 * 86400000).toISOString()}' WHERE id = '${old.orderId}'`);
    assert.deepEqual([(await reason(old.orderId)).eligible, (await reason(old.orderId)).reason], [false, "expired"]);
    const r = await refund(c, old.orderId);
    assert.equal(r.data.error.reason ?? r.data.error.details?.reason, "expired");
    const nopay = await mockBuy(c, [{ productId: "wallpapers" }]);
    sql(ctx.mock.stateDir, `UPDATE orders SET provider_payment_id = NULL WHERE id = '${nopay.orderId}'`);
    assert.equal((await reason(nopay.orderId)).reason, "free");
    const list = (await c.get("/api/orders")).data.orders;
    assert.equal(list.find((o) => o.id === old.orderId).refund.reason, "expired", "the order history carries the same reason");
    assert.equal(list.find((o) => o.id === nopay.orderId).refund.reason, "free");
  });

  test("a disputed order is not refundable here: no refund is sent to Stripe and the order is unchanged", async () => {
    const { c } = await newBuyer(ctx.stripe.url, "rf-dispute");
    const order = await stripeCheckout(c, [{ productId: "stems-patchwork" }]);
    const { session } = await stripePay(ctx, c, order);
    assert.equal((await c.get(`/api/orders/${order.orderId}`)).data.order.refund.eligible, true);
    const dispute = { id: eventId(), object: "event", type: "charge.dispute.created", livemode: false, created: Math.floor(Date.now() / 1000),
      data: { object: { id: "dp_rf", object: "dispute", payment_intent: session.payment_intent, status: "needs_response" } } };
    assert.equal((await sendWebhook(c, dispute, WEBHOOK_SECRET)).status, 200);
    const state = (await c.get(`/api/orders/${order.orderId}`)).data.order.refund;
    assert.deepEqual([state.eligible, state.reason], [false, "disputed"]);
    const sent = ctx.stripe.fake.refunds.length;
    const r = await refund(c, order.orderId);
    assert.equal(r.status, 409);
    assert.equal(r.data.error.code, "not_refundable");
    assert.equal(r.data.error.reason ?? r.data.error.details?.reason, "disputed");
    assert.equal(ctx.stripe.fake.refunds.length, sent, "nothing was asked of Stripe");
    assert.equal((await c.get(`/api/orders/${order.orderId}`)).data.order.status, "paid");
  });

  test("with Stripe: the refund is requested for the real payment; if Stripe refuses, nothing changes", async () => {
    const { c } = await newBuyer(ctx.stripe.url, "rf-stripe");
    const order = await stripeCheckout(c, [{ productId: "stems-patchwork" }]);
    const { session } = await stripePay(ctx, c, order);
    const sent = ctx.stripe.fake.refunds.length;
    ctx.stripe.fake.failRefunds(true);
    try {
      const failed = await refund(c, order.orderId);
      assert.equal(failed.status, 503);
      assert.equal((await c.get(`/api/orders/${order.orderId}`)).data.order.status, "paid");
    } finally { ctx.stripe.fake.failRefunds(false); }
    const ok = await refund(c, order.orderId);
    assert.equal(ok.status, 200);
    assert.equal(ok.data.order.status, "refunded");
    assert.equal(ctx.stripe.fake.refunds.at(-1).payment_intent, session.payment_intent);
    assert.ok(ctx.stripe.fake.refunds.length > sent);
    assert.deepEqual(await owned(c), []);
  });
});

// Customer refunds (server/orders/refunds.js): a paid order, inside 14 days, with nothing downloaded from it, is
// refunded by the customer themselves, and everything else (downloaded, too old, someone else's, unpaid, twice) is refused.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql, unique } from "../support/client.js";
import { newBuyer, mockBuy, stripeCheckout, stripePay } from "../support/flows.js";

export default (ctx) => describe("refunds", () => {
  const owned = async (c) => (await c.get("/api/library")).data.items.map((i) => i.productId);
  const refund = (c, orderId) => c.post(`/api/orders/${orderId}/refund`, {});

  test("an unused paid order is refunded by its buyer; the files leave their library; a second try is refused", async () => {
    const { c } = await newBuyer(ctx.mock.url, "rf-ok");
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

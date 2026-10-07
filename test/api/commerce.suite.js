// Commerce: the browser can't set prices, totals, ids or quantities it isn't allowed; duplicate checkouts collapse;
// owned, unpublished, paused and free products can't be bought; the success page proves nothing.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, unique } from "../support/client.js";
import { newBuyer, mockBuy, stripeCheckout } from "../support/flows.js";

export default (ctx) => describe("commerce", () => {
  test("prices, totals and titles sent by the browser are ignored", async () => {
    const c = new Client(ctx.stripe.url);
    const co = await c.post("/api/checkout", {
      email: unique("tamper"),
      items: [{ productId: "stems-patchwork", quantity: 1, price: 0.01, unitPriceCents: 1, title: "free stuff" }],
      total: 1, totalCents: 1, currency: "XXX"
    });
    assert.equal(co.status, 201);
    const sent = ctx.stripe.fake.created.find((x) => x.session.metadata.order_id === co.data.orderId);
    assert.equal(sent.session.amount_total, 999); // data/products.js: 9.99
    assert.equal(sent.form.line_items["0"].price_data.product_data.name, "Patchwork (Remix Stems)");
    assert.equal(sent.form.line_items["0"].price_data.currency, "usd");
  });

  test("the cart is priced by the server", async () => {
    const c = new Client(ctx.mock.url);
    const r = await c.post("/api/cart/price", { items: [{ productId: "sample-pack-vol1", quantity: 1, price: 0 }, { productId: "wallpapers" }] });
    assert.equal(r.status, 200);
    assert.equal(r.data.cart.totalCents, 2499 + 300);
  });

  test("unknown, unpublished, paused and free products can't be checked out", async () => {
    const c = new Client(ctx.mock.url);
    const email = unique("bad-ids");
    for (const [productId, problem] of [["no-such-thing", "not_found"], ["dev-unpublished", "not_found"], ["dev-paused", "unavailable"], ["dev-free", "free"]]) {
      const r = await c.post("/api/checkout", { email, items: [{ productId }] });
      assert.equal(r.status, 409, productId);
      assert.equal(r.data.error.code, "cart_changed");
      assert.deepEqual(r.data.error.problems, [{ productId, problem }]);
    }
    // An unpublished product looks exactly like a missing one everywhere.
    assert.equal((await c.get("/api/products/dev-unpublished")).status, 404);
    assert.ok(!(await c.get("/api/products")).data.products.some((p) => p.id === "dev-unpublished"));
  });

  test("malformed ids and quantities are rejected", async () => {
    const c = new Client(ctx.mock.url);
    const email = unique("qty");
    const bad = [
      [{ productId: "../../etc/passwd" }], [{ productId: "WALLPAPERS" }], [{ productId: 42 }], [{ productId: "wallpapers'; DROP TABLE orders;--" }],
      [{ productId: "wallpapers", quantity: 0 }], [{ productId: "wallpapers", quantity: -1 }], [{ productId: "wallpapers", quantity: 1.5 }],
      [{ productId: "wallpapers", quantity: "1" }], [{ productId: "wallpapers", quantity: 1e9 }],
      [{ productId: "wallpapers" }, { productId: "wallpapers" }], [], "wallpapers", null
    ];
    // A fresh client per try, so the checkout rate limit (12 a minute per client) isn't what answers.
    for (const items of bad) assert.equal((await new Client(ctx.mock.url).post("/api/checkout", { email, items })).status, 400, JSON.stringify(items));
    // Well-formed but more than a digital file allows.
    const two = await c.post("/api/checkout", { email, items: [{ productId: "wallpapers", quantity: 2 }] });
    assert.equal(two.status, 409);
    assert.equal(two.data.error.problems[0].problem, "quantity");
  });

  test("guests must give a real email", async () => {
    const c = new Client(ctx.mock.url);
    for (const email of [undefined, "", "not-an-email", "a@b", "<script>@x.dev", 42]) {
      assert.equal((await c.post("/api/checkout", { email, items: [{ productId: "wallpapers" }] })).status, 400, String(email));
    }
  });

  test("the same checkout key returns the same order, even when sent at once", async () => {
    const c = new Client(ctx.mock.url);
    const body = { email: unique("double"), items: [{ productId: "vj-loops" }] };
    const headers = { "Idempotency-Key": "same-click-" + Date.now() };
    const results = await Promise.all([1, 2, 3].map(() => c.post("/api/checkout", body, { headers })));
    const ok = results.filter((r) => r.status === 200 || r.status === 201);
    assert.ok(ok.length >= 1);
    assert.equal(new Set(ok.map((r) => r.data.orderId)).size, 1);
    results.filter((r) => !ok.includes(r)).forEach((r) => assert.equal(r.data.error.code, "checkout_in_progress"));
  });

  test("a signed-in customer's repeat checkout reuses the open order", async () => {
    const { c } = await newBuyer(ctx.mock.url, "repeat");
    const a = await c.post("/api/checkout", { items: [{ productId: "serum-presets" }] });
    const b = await c.post("/api/checkout", { items: [{ productId: "serum-presets" }] });
    assert.equal(a.data.orderId, b.data.orderId);
    assert.equal(b.data.reused, true);
  });

  test("owned products can't be bought again", async () => {
    const { c } = await newBuyer(ctx.mock.url, "owner");
    await mockBuy(c, [{ productId: "ep-corrupted-thread" }]);
    const again = await c.post("/api/checkout", { items: [{ productId: "ep-corrupted-thread" }] });
    assert.equal(again.status, 409);
    assert.equal(again.data.error.problems[0].problem, "owned");
  });

  test("visiting the success page doesn't pay for anything", async () => {
    const c = new Client(ctx.stripe.url);
    const order = await stripeCheckout(c, [{ productId: "wallpapers" }], { email: unique("faker") });
    await c.get(`/checkout?order=${order.orderId}&status=success`);
    assert.equal((await c.get(`/api/orders/${order.orderId}`)).data.order.status, "pending");
    // Reconcile asks Stripe, which says unpaid.
    assert.equal((await c.post(`/api/orders/${order.orderId}/reconcile`, {})).data.order.status, "pending");
    assert.equal((await c.get("/api/library")).data.items.length, 0);
  });

  test("the test-mode payment buttons don't exist outside mock mode", async () => {
    const c = new Client(ctx.stripe.url);
    const order = await stripeCheckout(c, [{ productId: "wallpapers" }], { email: unique("mockless") });
    const r = await c.post("/api/dev/mock-payment", { orderId: order.orderId, sessionId: order.sessionId, outcome: "paid" });
    assert.equal(r.status, 404);
    assert.equal((await c.get(`/api/orders/${order.orderId}`)).data.order.status, "pending");
    assert.equal((await c.get("/api/dev/outbox")).status, 200); // email log still exists (log provider in tests)
  });

  test("mock payments can't be applied to someone else's session", async () => {
    const a = new Client(ctx.mock.url);
    const co = await a.post("/api/checkout", { email: unique("mock-a"), items: [{ productId: "wallpapers" }] });
    const r = await new Client(ctx.mock.url).post("/api/dev/mock-payment", { orderId: co.data.orderId, sessionId: "mock_cs_guessed", outcome: "paid" });
    assert.equal(r.status, 404);
  });

  test("free products are claimed into the library, once", async () => {
    const { c } = await newBuyer(ctx.mock.url, "freebie");
    assert.equal((await c.post("/api/library/free", { productId: "dev-free" })).status, 200);
    assert.equal((await c.post("/api/library/free", { productId: "dev-free" })).status, 200);
    assert.equal((await c.post("/api/library/free", { productId: "wallpapers" })).status, 409);
    assert.equal((await c.post("/api/library/free", { productId: "dev-unpublished" })).status, 404);
    const lib = await c.get("/api/library");
    assert.deepEqual(lib.data.items.map((i) => i.productId), ["dev-free"]);
  });
});

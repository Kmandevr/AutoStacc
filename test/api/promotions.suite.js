// Sales and promo codes: only the owner manages them; input is validated; a sale changes the live price, what
// checkout charges and what the order records, and ending it restores the price; a code's discount reaches Stripe to
// the cent; usage limits hold even for simultaneous checkouts; the browser can't set prices or discounts; floors keep
// every charge at 50 cents or more. Uses its own products (promo-*), so other suites' prices never move.
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { Client, sql, outbox } from "../support/client.js";
import { newBuyer, adminClient, mockBuy, stripeCheckout, stripePay } from "../support/flows.js";

const T = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const product = (id, cents, project = null) => `INSERT INTO products (id, title, description, type, price_cents, currency, tags, metadata, featured,
  published, sales_paused, max_quantity, project_id, created_at, updated_at) VALUES ('${id}', 'Promo test ${id}', 'Test.', 'other', ${cents}, 'USD', '[]', '{}', 0, 1, 0, 1,
  ${project ? `'${project}'` : "NULL"}, ${T}, ${T});`;
const SETUP = [product("promo-a", 2000), product("promo-b", 1000), product("promo-c", 3000, "dev-other"), product("promo-d", 1500), product("promo-e", 900)].join("\n");

const create = (admin, body) => admin.post("/api/admin/promotions", { kind: "code", name: "Test", scope: "all", ...body });
const end = (admin, id) => admin.post(`/api/admin/promotions/${id}/end`, {});
const price = async (c, id) => (await c.get(`/api/products/${id}`)).data.product;

export default (ctx) => describe("promotions", () => {
  before(() => {
    sql(ctx.mock.stateDir, SETUP);
    sql(ctx.stripe.stateDir, SETUP);
  });

  test("only the owner manages promotions, and input is checked", async () => {
    const { c } = await newBuyer(ctx.mock.url, "promo-customer");
    for (const client of [c, new Client(ctx.mock.url)]) {
      assert.equal((await client.get("/api/admin/promotions")).status, 404);
      assert.equal((await create(client, { code: "NOPE1", percentOff: 10 })).status, 404);
      assert.equal((await end(client, "promo_aaaa")).status, 404);
    }
    const admin = await adminClient(ctx.mock.url);
    for (const bad of [{ code: "P95X", percentOff: 95 }, { code: "BOTH1", percentOff: 10, amountOffCents: 100 }, { code: "NONE1" },
      { code: "a b!", percentOff: 10 }, { code: "SCOPE1", percentOff: 10, scope: "products", scopeIds: ["no-such-product"] },
      { code: "SCOPE2", percentOff: 10, scope: "project", scopeIds: [] }, { code: "DATES1", percentOff: 10, startsAt: "2030-01-02T00:00:00.000Z", endsAt: "2030-01-01T00:00:00.000Z" },
      { kind: "other", percentOff: 10 }, { code: "STR1", percentOff: "10" }]) {
      assert.equal((await create(admin, bad)).status, 400, JSON.stringify(bad));
    }
    const first = await create(admin, { code: "dup-code", percentOff: 10, scope: "products", scopeIds: ["promo-e"] });
    assert.equal(first.status, 201);
    assert.equal((await create(admin, { code: "DUP-CODE", percentOff: 20 })).data.error.code, "code_taken");
    await end(admin, first.data.id);
  });

  test("a sale lowers the live price and the charge, is recorded on the order, and ending it restores the price", async () => {
    const admin = await adminClient(ctx.mock.url);
    const anon = new Client(ctx.mock.url);
    const sale = await admin.post("/api/admin/promotions", { kind: "sale", name: "Spring sale", percentOff: 25, scope: "products", scopeIds: ["promo-a"] });
    assert.equal(sale.status, 201);
    const p = await price(anon, "promo-a");
    assert.deepEqual([p.priceCents, p.listPriceCents, p.sale.name], [1500, 2000, "Spring sale"]);
    assert.equal((await price(anon, "promo-b")).sale, null, "only what it covers");
    const state = (await anon.get("/api/products/state?ids=promo-a")).data.products["promo-a"];
    assert.equal(state.priceCents, 1500);

    const { c } = await newBuyer(ctx.mock.url, "promo-sale");
    const cart = (await c.post("/api/cart/price", { items: [{ productId: "promo-a" }] })).data.cart;
    assert.equal(cart.totalCents, 1500);
    const { orderId } = await mockBuy(c, [{ productId: "promo-a" }]);
    const row = sql(ctx.mock.stateDir, `SELECT o.total_cents, o.status, i.unit_price_cents, i.list_price_cents, i.sale_id FROM orders o JOIN order_items i ON i.order_id = o.id WHERE o.id = '${orderId}'`)[0];
    assert.deepEqual(row, { total_cents: 1500, status: "paid", unit_price_cents: 1500, list_price_cents: 2000, sale_id: sale.data.id });

    const listed = (await admin.get("/api/admin/promotions")).data.promotions.find((x) => x.id === sale.data.id);
    assert.deepEqual([listed.status, listed.paidOrders, listed.discountCents], ["running", 1, 500]);
    const stats = (await admin.get("/api/admin/stats/promotions?mode=test")).data.sections[0].metrics;
    assert.ok(stats.find((m) => m.id === "by-promotion").rows.some((r) => r[0] === "Spring sale"));

    assert.equal((await end(admin, sale.data.id)).status, 200);
    assert.equal((await price(anon, "promo-a")).priceCents, 2000);
    const log = (await admin.get("/api/admin/audit?action=promotion")).data.entries.filter((x) => x.targetId === sale.data.id).map((x) => x.action);
    assert.deepEqual(log.sort(), ["promotion.created", "promotion.ended"]);
  });

  test("a scheduled sale waits for its start, and a sale never takes a price below 50 cents", async () => {
    const admin = await adminClient(ctx.mock.url);
    const anon = new Client(ctx.mock.url);
    const later = await admin.post("/api/admin/promotions", { kind: "sale", name: "Later", percentOff: 50, scope: "products", scopeIds: ["promo-d"],
      startsAt: new Date(Date.now() + 86400000).toISOString() });
    assert.equal((await price(anon, "promo-d")).priceCents, 1500);
    const deep = await admin.post("/api/admin/promotions", { kind: "sale", name: "Deep", amountOffCents: 1490, scope: "products", scopeIds: ["promo-d"] });
    assert.equal((await price(anon, "promo-d")).priceCents, 50);
    await end(admin, later.data.id);
    await end(admin, deep.data.id);
    assert.equal((await price(anon, "promo-d")).priceCents, 1500);
  });

  test("a code's discount is charged exactly through Stripe and shows on the receipt", async () => {
    const admin = await adminClient(ctx.stripe.url);
    const code = await create(admin, { code: "STRIPE15", name: "Fifteen", percentOff: 15, scope: "products", scopeIds: ["promo-a", "promo-b"] });
    assert.equal(code.status, 201);
    const { c, user } = await newBuyer(ctx.stripe.url, "promo-stripe");
    const items = [{ productId: "promo-a" }, { productId: "promo-b" }];
    const cart = (await c.post("/api/cart/price", { items, promoCode: "stripe15" })).data.cart;
    assert.deepEqual([cart.subtotalCents, cart.discountCents, cart.totalCents, cart.promoCode], [3000, 450, 2550, "STRIPE15"]);
    const order = await stripeCheckout(c, items, { promoCode: " stripe15 " });
    const { res, session } = await stripePay(ctx, c, order);
    assert.equal(session.amount_total, 2550, "Stripe is asked for exactly the order total");
    assert.equal(res.status, 200);
    const row = sql(ctx.stripe.stateDir, `SELECT status, total_cents, discount_cents, promo_code FROM orders WHERE id = '${order.orderId}'`)[0];
    assert.deepEqual(row, { status: "paid", total_cents: 2550, discount_cents: 450, promo_code: "STRIPE15" });
    const mail = (await outbox(ctx.stripe.url, user.email)).find((m) => m.kind === "purchase-confirmation");
    assert.match(mail.body_text, /Discount \(STRIPE15\)/);
    await end(admin, code.data.id);
  });

  test("usage limits hold, even when two buyers check out at the same moment", async () => {
    const admin = await adminClient(ctx.mock.url);
    const one = await create(admin, { code: "ONLYONE", percentOff: 10, maxRedemptions: 1, scope: "products", scopeIds: ["promo-b"] });
    const [a, b] = [await newBuyer(ctx.mock.url, "promo-race-a"), await newBuyer(ctx.mock.url, "promo-race-b")];
    const tries = await Promise.all([a, b].map(({ c }) => c.post("/api/checkout", { items: [{ productId: "promo-b" }], promoCode: "ONLYONE" })));
    assert.deepEqual(tries.map((r) => r.status).sort(), [201, 409]);
    assert.equal(tries.find((r) => r.status === 409).data.error.promoProblem, "used_up");
    assert.equal(sql(ctx.mock.stateDir, `SELECT COUNT(*) AS n FROM orders WHERE promotion_id = '${one.data.id}'`)[0].n, 1);

    const once = await create(admin, { code: "ONCEEACH", percentOff: 10, oncePerCustomer: true });
    const { c } = await newBuyer(ctx.mock.url, "promo-once");
    const first = await mockBuy(c, [{ productId: "promo-c" }], { promoCode: "ONCEEACH" });
    assert.equal(sql(ctx.mock.stateDir, `SELECT discount_cents FROM orders WHERE id = '${first.orderId}'`)[0].discount_cents, 300);
    const again = await c.post("/api/checkout", { items: [{ productId: "promo-d" }], promoCode: "ONCEEACH" });
    assert.equal(again.data.error.promoProblem, "already_used");
    // A guest can't get round it by checking out signed out with the same email.
    const guest = new Client(ctx.mock.url);
    const email = sql(ctx.mock.stateDir, `SELECT email FROM orders WHERE id = '${first.orderId}'`)[0].email;
    assert.equal((await guest.post("/api/checkout", { items: [{ productId: "promo-d" }], email, promoCode: "ONCEEACH" })).status, 409);
    await end(admin, one.data.id);
    await end(admin, once.data.id);
  });

  test("an unpaid checkout never locks anyone out of a code: not the buyer themselves, and not others through guest checkouts", async () => {
    const admin = await adminClient(ctx.mock.url);
    const code = await create(admin, { code: "HOLDTEST", percentOff: 10, maxRedemptions: 1, oncePerCustomer: true, scope: "products", scopeIds: ["promo-e"] });
    const items = [{ productId: "promo-e" }];
    // A stranger's guest checkouts (with anyone's email) hold nothing.
    const { c, user } = await newBuyer(ctx.mock.url, "promo-hold");
    for (const email of ["someone@example.com", user.email]) {
      assert.equal((await new Client(ctx.mock.url).post("/api/checkout", { items, email, promoCode: "HOLDTEST" })).status, 201);
    }
    // The buyer leaves their own payment page unpaid: the code still works for them, and their order is reused.
    const first = await c.post("/api/checkout", { items, promoCode: "HOLDTEST" });
    assert.equal(first.status, 201);
    assert.equal((await c.post("/api/cart/price", { items, promoCode: "HOLDTEST" })).data.cart.promoProblem, null);
    const again = await c.post("/api/checkout", { items, promoCode: "HOLDTEST" });
    assert.equal(again.data.orderId, first.data.orderId);
    // Another account can't take the last use while that payment page is open.
    const { c: other } = await newBuyer(ctx.mock.url, "promo-hold-other");
    assert.equal((await other.post("/api/checkout", { items, promoCode: "HOLDTEST" })).data.error.promoProblem, "used_up");
    await end(admin, code.data.id);
  });

  test("trying codes is rate limited, and the cart never shows internal promotion ids", async () => {
    const admin = await adminClient(ctx.mock.url);
    const sale = await admin.post("/api/admin/promotions", { kind: "sale", name: "Id check", percentOff: 10, scope: "products", scopeIds: ["promo-b"] });
    const c = new Client(ctx.mock.url);
    const priced = await c.post("/api/cart/price", { items: [{ productId: "promo-b" }] });
    assert.ok(!JSON.stringify(priced.data).includes("promo_"), "no promotion ids");
    assert.equal(priced.data.cart.lines[0].sale.name, "Id check");
    const statuses = [];
    for (let i = 0; i < 20; i++) statuses.push((await c.post("/api/cart/price", { items: [{ productId: "promo-b" }], promoCode: `GUESS${i}X` })).status);
    assert.ok(statuses.includes(429), "guessing gets throttled");
    await end(admin, sale.data.id);
  });

  test("bad, ended and not-yet codes are refused; codes never take an order below 50 cents", async () => {
    const admin = await adminClient(ctx.mock.url);
    const { c } = await newBuyer(ctx.mock.url, "promo-bad");
    const items = [{ productId: "promo-e" }];
    assert.equal((await c.post("/api/cart/price", { items, promoCode: "NOSUCHCODE" })).data.cart.promoProblem, "invalid");
    assert.equal((await c.post("/api/checkout", { items, promoCode: "NOSUCHCODE" })).data.error.code, "promo_invalid");
    const soon = await create(admin, { code: "SOON", percentOff: 10, startsAt: new Date(Date.now() + 86400000).toISOString() });
    assert.equal((await c.post("/api/cart/price", { items, promoCode: "SOON" })).data.cart.promoProblem, "invalid", "a scheduled code isn't revealed early");
    const other = await create(admin, { code: "OTHERPROJECT", percentOff: 10, scope: "project", scopeIds: ["dev-other"] });
    assert.equal((await c.post("/api/cart/price", { items, promoCode: "OTHERPROJECT" })).data.cart.promoProblem, "not_applicable");
    const huge = await create(admin, { code: "HUGE", amountOffCents: 100000 });
    assert.equal((await c.post("/api/cart/price", { items, promoCode: "HUGE" })).data.cart.totalCents, 50);
    for (const p of [soon, other, huge]) await end(admin, p.data.id);
    assert.equal((await c.post("/api/cart/price", { items, promoCode: "HUGE" })).data.cart.promoProblem, "ended");
  });

  test("the browser can't set a price or a discount, and adding a code opens a new order", async () => {
    const { c } = await newBuyer(ctx.mock.url, "promo-tamper");
    const plain = await c.post("/api/checkout", { items: [{ productId: "promo-b", unitPriceCents: 1, priceCents: 1 }], discountCents: 999, totalCents: 1 });
    assert.equal(plain.status, 201);
    assert.equal(sql(ctx.mock.stateDir, `SELECT total_cents FROM orders WHERE id = '${plain.data.orderId}'`)[0].total_cents, 1000);
    const admin = await adminClient(ctx.mock.url);
    const code = await create(admin, { code: "LATER10", percentOff: 10 });
    const withCode = await c.post("/api/checkout", { items: [{ productId: "promo-b" }], promoCode: "LATER10" });
    assert.notEqual(withCode.data.orderId, plain.data.orderId);
    assert.equal(sql(ctx.mock.stateDir, `SELECT total_cents FROM orders WHERE id = '${withCode.data.orderId}'`)[0].total_cents, 900);
    await end(admin, code.data.id);
  });
});

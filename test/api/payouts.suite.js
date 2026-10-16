// Creator payouts through Stripe Connect (docs/creators.md#payouts): creators' products are paid on the marketplace
// Stripe account and AutoStacc's own on the main one, a mixed cart is paid in two steps, each account's webhook is
// believed only for its own orders, a creator connects a payout account (onboarding done on Stripe), asks for a payout
// after the hold, the admin sends it as one Stripe transfer (never two), failures change nothing, and a refund after
// payout shows as a negative balance taken from later sales.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql, sendWebhook } from "../support/client.js";
import { newBuyer, adminClient, stripeCheckout, sessionEvent, eventId } from "../support/flows.js";
import { WEBHOOK_SECRET, MARKETPLACE_WEBHOOK_SECRET, MARKETPLACE_KEY } from "../support/servers.js";

const ZIP = Buffer.from("PK\u0003\u0004 sample pack", "latin1");
const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const put = (client, path, raw) => client.req("PUT", path, { raw, headers: { "Content-Type": "application/octet-stream" } });

export default (ctx) => describe("payouts", () => {
  const base = () => ctx.stripe.url;
  const fake = () => ctx.stripe.fake;
  const db = (q) => sql(ctx.stripe.stateDir, q);

  // A creator with one product on sale (their file is trusted, so it is delivered at once).
  async function seller(tag, priceCents = 2000) {
    const { c, user } = await newBuyer(base(), tag);
    const cr = await c.post("/api/studio/creators", { name: `Seller ${tag}`, slug: slug(tag) });
    assert.equal(cr.status, 201, JSON.stringify(cr.data));
    const pr = await c.post(`/api/studio/creators/${cr.data.creator.id}/projects`, { name: "Beats", slug: "beats" });
    const made = await c.post(`/api/studio/projects/${pr.data.project.id}/products`, { title: "Dusty Drums", type: "sample-pack", priceCents, description: "Warm one-shots.", includes: ["40 kicks"] });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    const product = made.data.product;
    db(`UPDATE creators SET trusted = 1 WHERE id = '${cr.data.creator.id}'`);
    assert.equal((await put(c, `/api/studio/products/${product.id}/files?filename=drums.zip`, ZIP)).status, 201);
    assert.equal((await c.req("PATCH", `/api/studio/products/${product.id}`, { body: { published: true } })).status, 200);
    return { c, user, creator: cr.data.creator, product };
  }

  const paid = async (account, order) => {
    const session = fake().pay(order.sessionId);
    const secret = account === "marketplace" ? MARKETPLACE_WEBHOOK_SECRET : WEBHOOK_SECRET;
    const path = account === "marketplace" ? "/api/webhooks/stripe-marketplace" : "/api/webhooks/stripe";
    return sendWebhook(new Client(base()), sessionEvent("checkout.session.completed", session), secret, undefined, path);
  };
  // A paid creator sale, aged past the refund hold so it can be paid out.
  async function sale(s, daysOld = 20) {
    const buyer = await newBuyer(base(), "payer");
    const order = await stripeCheckout(buyer.c, [{ productId: s.product.id }]);
    const res = await paid("marketplace", order);
    assert.equal(res.data.outcome, "paid", JSON.stringify(res.data));
    db(`UPDATE orders SET paid_at = '${daysAgo(daysOld)}' WHERE id = '${order.orderId}'`);
    return { ...order, buyer };
  }
  const connect = async (s, country = "US") => {
    const r = await s.c.post(`/api/studio/creators/${s.creator.id}/payout-account`, { country });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const id = db(`SELECT stripe_account_id AS id FROM creators WHERE id = '${s.creator.id}'`)[0].id;
    fake().completeOnboarding(id);
    return id;
  };
  const request = (s) => s.c.post(`/api/studio/creators/${s.creator.id}/payouts`, {});
  const settle = async (id, status, note = "") => (await adminClient(base())).req("PATCH", `/api/admin/payouts/${id}`, { body: { status, note } });

  test("creators' products are charged on the marketplace account, AutoStacc's on the main one, with tax and a tax code each", async () => {
    const s = await seller("route");
    const mine = await newBuyer(base(), "route-buyer");
    const m = await stripeCheckout(mine.c, [{ productId: s.product.id }]);
    const sentM = fake().created.find((x) => x.session.metadata.order_id === m.orderId);
    assert.equal(sentM.key, `Bearer ${MARKETPLACE_KEY}`, "creator products use the marketplace key");
    assert.equal(sentM.form.automatic_tax.enabled, "true", "Stripe Tax is on for creator sales");
    assert.match(sentM.form.line_items["0"].price_data.product_data.tax_code, /^txcd_\d+$/);
    assert.equal(db(`SELECT payment_account FROM orders WHERE id = '${m.orderId}'`)[0].payment_account, "marketplace");

    const o = await stripeCheckout(mine.c, [{ productId: "stems-patchwork" }]);
    const sentO = fake().created.find((x) => x.session.metadata.order_id === o.orderId);
    assert.notEqual(sentO.key, `Bearer ${MARKETPLACE_KEY}`, "AutoStacc's own products stay on the main account");
    assert.equal(sentO.form.automatic_tax, undefined, "Managed Payments handles its tax");
    assert.equal(db(`SELECT payment_account FROM orders WHERE id = '${o.orderId}'`)[0].payment_account, "main");
  });

  test("a cart with both kinds is paid in two steps, one account at a time", async () => {
    const s = await seller("mixed");
    const b = await newBuyer(base(), "mixed-buyer");
    const items = [{ productId: "stems-patchwork" }, { productId: s.product.id }];
    const both = await b.c.post("/api/checkout", { items });
    assert.equal(both.status, 409);
    assert.equal(both.data.error.code, "split_checkout");
    assert.deepEqual(both.data.error.groups, { main: ["stems-patchwork"], marketplace: [s.product.id] });
    const first = await b.c.post("/api/checkout", { items, account: "marketplace" });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    const second = await b.c.post("/api/checkout", { items, account: "main" });
    assert.equal(second.status, 201, JSON.stringify(second.data));
    assert.notEqual(first.data.orderId, second.data.orderId);
    assert.deepEqual(db(`SELECT product_id FROM order_items WHERE order_id = '${first.data.orderId}'`).map((r) => r.product_id), [s.product.id]);
    assert.deepEqual(db(`SELECT product_id FROM order_items WHERE order_id = '${second.data.orderId}'`).map((r) => r.product_id), ["stems-patchwork"]);
    assert.equal((await b.c.post("/api/checkout", { items, account: "nonsense" })).status, 409, "an unknown account is no choice");
  });

  test("each Stripe account's webhook is believed only for its own orders", async () => {
    const s = await seller("hooks");
    const b = await newBuyer(base(), "hooks-buyer");
    const order = await stripeCheckout(b.c, [{ productId: s.product.id }]);
    // Signed with the main account's secret to the main endpoint: valid signature, wrong account for this order.
    const wrong = await paid("main", order);
    assert.equal(wrong.status, 200);
    assert.match(wrong.data.outcome, /rejected/);
    assert.equal((await b.c.get(`/api/orders/${order.orderId}`)).data.order.status, "pending");
    // The marketplace endpoint refuses the main secret, and accepts its own.
    const session = fake().pay(order.sessionId);
    const ev = sessionEvent("checkout.session.completed", session);
    assert.equal((await sendWebhook(new Client(base()), ev, WEBHOOK_SECRET, undefined, "/api/webhooks/stripe-marketplace")).status, 400);
    assert.equal((await sendWebhook(new Client(base()), ev, MARKETPLACE_WEBHOOK_SECRET, undefined, "/api/webhooks/stripe-marketplace")).data.outcome, "paid");
    assert.equal((await b.c.get(`/api/orders/${order.orderId}`)).data.order.status, "paid");
    // The main endpoint, in turn, doesn't confirm a marketplace payment even if the id matches an AutoStacc order.
    const own = await stripeCheckout(b.c, [{ productId: "stems-patchwork" }]);
    const crossed = await paid("marketplace", own);
    assert.match(crossed.data.outcome, /rejected/);
    assert.equal((await b.c.get(`/api/orders/${own.orderId}`)).data.order.status, "pending");
  });

  test("connecting a payout account: owners only, a supported country first, one account however many clicks", async () => {
    const s = await seller("connect");
    const stranger = await newBuyer(base(), "stranger");
    const path = `/api/studio/creators/${s.creator.id}/payout-account`;
    assert.equal((await new Client(base()).post(path, { country: "US" })).status, 401);
    assert.equal((await stranger.c.post(path, { country: "US" })).status, 404);
    assert.equal((await stranger.c.get(path)).status, 404);
    for (const country of ["", "usa", "1", "u s", null]) assert.equal((await s.c.post(path, { country })).status, 400, String(country));
    const opened = fake().accounts.size;
    // (Each try counts against the hourly limit on this route, so only two unsupported countries are tried.)
    for (const country of ["JP", "BR"]) {
      const r = await s.c.post(path, { country });
      assert.equal(r.status, 400, country);
      assert.equal(r.data.error.code, "unsupported_country", country);
    }
    assert.equal(fake().accounts.size, opened, "no account opened for a refused country");
    assert.equal((await s.c.get(path)).data.connected, false);

    const before = fake().accounts.size;
    const one = await s.c.post(path, { country: "DE" });
    assert.equal(one.status, 201);
    assert.match(one.data.url, /\/onboard\/acct_/);
    const two = await s.c.post(path, { country: "FR" });
    assert.equal(fake().accounts.size, before + 1, "a second click doesn't open a second account");
    assert.equal(two.data.url, one.data.url);
    const acct = [...fake().accounts.values()].at(-1);
    assert.equal(acct.country, "DE", "the first country sticks");
    assert.equal(acct.form.tos_acceptance, undefined, "the normal service agreement, in every supported country");
    assert.equal(acct.key, `Bearer ${MARKETPLACE_KEY}`);
    const st = await s.c.get(path);
    assert.deepEqual([st.data.connected, st.data.payoutsEnabled], [true, false], "not ready until Stripe says so");
    fake().completeOnboarding(acct.id);
    assert.equal((await s.c.get(path)).data.payoutsEnabled, true);
    const us = await seller("connect-us");
    await connect(us, "US");
  });

  test("a payout request needs a ready account; the admin's Send is one Stripe transfer of exactly the cleared share", async () => {
    const s = await seller("pay");
    const o = await sale(s);
    assert.equal((await request(s)).status, 409, "no payout account yet");
    const acct = await connect(s);
    fake().completeOnboarding(acct);
    const asked = await request(s);
    assert.equal(asked.status, 201, JSON.stringify(asked.data));
    assert.equal(asked.data.payout.amountCents, 1600);
    assert.equal((await request(s)).status, 409, "one open request at a time");
    const id = asked.data.payout.id;

    const stranger = await newBuyer(base(), "pay-stranger");
    assert.equal((await stranger.c.req("PATCH", `/api/admin/payouts/${id}`, { body: { status: "paid" } })).status, 404, "admin only");

    const sent = fake().transfers.length;
    const ok = await settle(id, "paid", "thanks");
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(fake().transfers.length, sent + 1);
    const t = fake().transfers.at(-1);
    assert.deepEqual([t.amount, t.destination, t.key], [1600, acct, `Bearer ${MARKETPLACE_KEY}`]);
    assert.deepEqual(db(`SELECT status, transfer_id FROM payout_requests WHERE id = '${id}'`), [{ status: "paid", transfer_id: t.id }]);
    assert.equal((await settle(id, "paid")).status, 404, "settled once");
    assert.equal(fake().transfers.length, sent + 1, "a second Send sends nothing");
    const e = (await s.c.get(`/api/studio/creators/${s.creator.id}/earnings`)).data.earnings;
    assert.deepEqual([e.paidOutCents, e.availableCents, e.balanceCents], [1600, 0, 0]);
    void o;
  });

  test("a failed or underfunded transfer changes nothing and can be sent again; declining sends nothing", async () => {
    const s = await seller("fail");
    await sale(s);
    const acct = await connect(s);
    const id = (await request(s)).data.payout.id;
    const before = fake().transfers.length;

    fake().failTransfers(true);
    const refused = await settle(id, "paid");
    fake().failTransfers(false);
    assert.equal(refused.status, 503);
    assert.equal(refused.data.error.code, "transfer_failed");
    assert.equal(db(`SELECT status FROM payout_requests WHERE id = '${id}'`)[0].status, "requested");

    fake().setBalance(500);
    const poor = await settle(id, "paid");
    fake().setBalance(1_000_000);
    assert.equal(poor.status, 503);
    assert.match(poor.data.error.message, /insufficient funds/i);
    assert.equal(db(`SELECT status FROM payout_requests WHERE id = '${id}'`)[0].status, "requested");
    assert.equal(fake().transfers.length, before, "nothing was sent");

    assert.equal((await settle(id, "paid")).status, 200, "it goes out once the problem is fixed");
    assert.equal(fake().transfers.length, before + 1);

    const s2 = await seller("decline");
    await sale(s2);
    await connect(s2);
    const id2 = (await request(s2)).data.payout.id;
    const n = fake().transfers.length;
    assert.equal((await settle(id2, "declined", "not now")).status, 200);
    assert.equal(fake().transfers.length, n, "declining sends no money");
    assert.equal(acct.startsWith("acct_"), true);
  });

  test("a refund after the payout leaves a negative balance that later sales cover before anything is available", async () => {
    const s = await seller("clawback");
    const o = await sale(s);
    await connect(s);
    const id = (await request(s)).data.payout.id;
    assert.equal((await settle(id, "paid")).status, 200);

    // Stripe reports the sale refunded after it was paid out.
    const intent = db(`SELECT provider_payment_id AS p FROM orders WHERE id = '${o.orderId}'`)[0].p;
    const refund = { id: eventId(), object: "event", type: "charge.refunded", livemode: false, created: Math.floor(Date.now() / 1000),
      data: { object: { object: "charge", payment_intent: intent, refunded: true, amount_refunded: 2000, currency: "usd" } } };
    const res = await sendWebhook(new Client(base()), refund, MARKETPLACE_WEBHOOK_SECRET, undefined, "/api/webhooks/stripe-marketplace");
    assert.equal(res.data.outcome, "refunded");
    let e = (await s.c.get(`/api/studio/creators/${s.creator.id}/earnings`)).data.earnings;
    assert.deepEqual([e.paidOutCents, e.availableCents, e.balanceCents], [1600, 0, -1600], "owes the refunded share");
    assert.equal((await request(s)).status, 409, "nothing to ask for");

    await sale(s);
    e = (await s.c.get(`/api/studio/creators/${s.creator.id}/earnings`)).data.earnings;
    assert.deepEqual([e.availableCents, e.balanceCents], [0, 0], "the new sale only covers the refund");
    await sale(s);
    e = (await s.c.get(`/api/studio/creators/${s.creator.id}/earnings`)).data.earnings;
    assert.deepEqual([e.availableCents, e.balanceCents], [1600, 1600], "after that, money is available again");
  });
});

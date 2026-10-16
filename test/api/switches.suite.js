// Settings › Switches (server/admin/switches.js): only an admin reads or flips them, only known switches with their
// allowed values; each one is enforced by the action itself (checkout and free claims, sign-up, new creators, payout
// requests, reviews), not just the page; the notice is public through /api/site-status; every change is audited.
// Leaves every switch open again, since later suites share the store.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, unique } from "../support/client.js";
import { adminClient } from "../support/flows.js";

const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export default (ctx) => describe("switches", () => {
  const base = () => ctx.mock.url;
  const flip = async (key, value) => {
    const r = await (await adminClient(base())).req("PUT", "/api/admin/switches", { body: { key, value } });
    assert.equal(r.status, 200, `${key}=${value}`);
    return r.data.switches;
  };
  const code = (r) => r.data && r.data.error && r.data.error.code;

  test("only an admin reads or changes them, and only known switches with allowed values", async () => {
    const shopper = new Client(base());
    await verifiedUser(shopper, unique("switch-shopper"));
    for (const c of [new Client(base()), shopper]) {
      assert.equal((await c.get("/api/admin/switches")).status, 404);
      assert.equal((await c.req("PUT", "/api/admin/switches", { body: { key: "store_sales", value: "paused" } })).status, 404);
    }
    const admin = await adminClient(base());
    const now = (await admin.get("/api/admin/switches")).data.switches;
    assert.deepEqual(now, { store_sales: "open", payout_requests: "open", signups: "open", creator_signups: "open", reviews: "open", site_notice: "" });
    for (const body of [{ key: "creator_sales", value: "paused" }, { key: "storage_cap_gb", value: "1" }, { key: "store_sales", value: "off" },
      { key: "signups", value: true }, { key: "site_notice", value: "x".repeat(201) }, { key: "site_notice", value: "two\nlines" }]) {
      assert.equal((await admin.req("PUT", "/api/admin/switches", { body })).status, 400, JSON.stringify(body).slice(0, 60));
    }
  });

  test("the notice is public and plain; changes are audited", async () => {
    await flip("site_notice", "  Maintenance tonight at 10pm  ");
    const s = await new Client(base()).get("/api/site-status");
    assert.equal(s.status, 200);
    assert.deepEqual(s.data, { notice: "Maintenance tonight at 10pm", sales: "open", signups: "open" });
    await flip("site_notice", "");
    const log = (await (await adminClient(base())).get("/api/admin/audit")).data;
    assert.match(JSON.stringify(log), /settings\.site_notice/);
  });

  test("each switch is enforced by the action itself", async () => {
    const buyer = new Client(base());
    await verifiedUser(buyer, unique("switch-buyer"));
    const creator = await buyer.post("/api/studio/creators", { name: "Switch Tester", slug: slug("switch") });
    assert.equal(creator.status, 201);

    await flip("store_sales", "paused");
    assert.equal(code(await buyer.post("/api/checkout", { items: [{ productId: "wallpapers", qty: 1 }] })), "sales_paused");
    assert.equal(code(await buyer.post("/api/library/free", { productId: "dev-free" })), "sales_paused");
    assert.equal((await new Client(base()).get("/api/site-status")).data.sales, "paused");
    await flip("store_sales", "open");

    await flip("signups", "closed");
    const anon = new Client(base());
    const r = await anon.post("/api/auth/sign-up/email", { email: `${unique("closed")}`, password: "correct-horse-battery", name: "Closed" });
    assert.equal(r.status, 403);
    assert.equal(code(r), "signups_closed");
    await flip("signups", "open");

    await flip("creator_signups", "closed");
    assert.equal(code(await buyer.post("/api/studio/creators", { name: "Another", slug: slug("closed") })), "creator_signups_closed");
    await flip("creator_signups", "open");

    await flip("payout_requests", "paused");
    const ask = await buyer.post(`/api/studio/creators/${creator.data.creator.id}/payouts`, { details: "Bank details here" });
    assert.equal(code(ask), "payouts_paused");
    await flip("payout_requests", "open");

    await flip("reviews", "paused");
    assert.equal(code(await buyer.req("PUT", "/api/products/stems-patchwork/review", { body: { rating: 5 } })), "reviews_paused");
    await flip("reviews", "open");
  });
});

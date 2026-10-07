// Admin: only the configured owner gets in; grants and revokes work and are separate records; uploads stay private.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, unique } from "../support/client.js";
import { newBuyer, adminClient, mockBuy } from "../support/flows.js";

export default (ctx) => describe("admin", () => {
  test("customers get 404 on every admin route", async () => {
    const { c } = await newBuyer(ctx.mock.url, "not-admin");
    for (const [m, p] of [["GET", "/api/admin/summary"], ["GET", "/api/admin/products"], ["PATCH", "/api/admin/products/wallpapers"],
      ["PUT", "/api/admin/products/wallpapers/files?filename=x.zip"], ["DELETE", "/api/admin/files/pf_x"], ["GET", "/api/admin/orders"],
      ["POST", "/api/admin/entitlements"], ["GET", "/api/admin/customers"], ["GET", "/api/admin/analytics"]]) {
      const r = await c.req(m, p, m === "GET" ? {} : { body: {} });
      assert.equal(r.status, 404, `${m} ${p}`);
    }
  });

  test("the owner can grant and revoke access, and uploads land privately", async () => {
    const admin = await adminClient(ctx.mock.url);
    assert.equal((await admin.get("/api/admin/summary")).status, 200);
    const { c, user } = await newBuyer(ctx.mock.url, "gifted");
    const grant = await admin.post("/api/admin/entitlements", { email: user.email, productId: "vj-loops", sourceType: "promo", note: "test" });
    assert.equal(grant.status, 201);
    assert.deepEqual((await c.get("/api/library")).data.items.map((i) => i.productId), ["vj-loops"]);
    const ents = (await admin.get(`/api/admin/entitlements?email=${encodeURIComponent(user.email)}`)).data.entitlements;
    assert.equal(ents.length, 1);
    assert.equal((await admin.post(`/api/admin/entitlements/${ents[0].id}/revoke`, { reason: "test" })).status, 200);
    assert.deepEqual((await c.get("/api/library")).data.items, []);

    const upload = await admin.req("PUT", "/api/admin/products/vj-loops/files?filename=loops.zip&label=Loops", { raw: "fake zip bytes", headers: { "Content-Type": "application/zip" } });
    assert.equal(upload.status, 201);
    const products = (await admin.get("/api/admin/products")).data.products;
    assert.ok(products.find((p) => p.id === "vj-loops").files.some((f) => f.id === upload.data.fileId));
    // Not reachable without owning the product.
    assert.equal((await c.post("/api/downloads", { fileId: upload.data.fileId })).status, 403);
  });

  test("order details show the payment trail", async () => {
    const admin = await adminClient(ctx.mock.url);
    const buyer = new Client(ctx.mock.url);
    const { orderId } = await mockBuy(buyer, [{ productId: "wallpapers" }], { email: unique("trail") });
    const d = await admin.get(`/api/admin/orders/${orderId}`);
    assert.equal(d.data.order.status, "paid");
    assert.ok(d.data.events.some((e) => e.outcome === "paid"));
    assert.equal(d.data.entitlements.length, 1);
  });
});

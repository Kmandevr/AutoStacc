// First-party money and limits (owner, 2026-10-21, #171/#177; server/creators/policy.js isFirstParty): a sale of a
// first-party creator's product (creators.source 'catalog') is AutoStacc's own revenue, so its order line records no
// platform fee and no creator share (nothing to hold or pay out), while a Studio creator's sale still splits; the Studio
// reports a first-party creator as unlimited (no product cap, no storage quota, fee 0) and refuses it paid storage.
// The creator is made in the Studio and then marked first-party in the database, as the owner's account would hold it.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { newBuyer, mockBuy } from "../support/flows.js";
import { sql } from "../support/client.js";

const ZIP = Buffer.from("PK\u0003\u0004 first-party pack", "latin1");
const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const put = (client, path, raw) => client.req("PUT", path, { raw, headers: { "Content-Type": "application/octet-stream" } });

export default (ctx) => describe("first-party money and limits", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);

  // A creator with one project and one product on sale at $20; firstParty marks it AutoStacc's own afterwards.
  async function seller(tag, { firstParty }) {
    const { c } = await newBuyer(base(), tag);
    const creator = (await c.post("/api/studio/creators", { name: `Maker ${tag}`, slug: slug(tag) })).data.creator;
    const project = (await c.post(`/api/studio/creators/${creator.id}/projects`, { name: "Kits", slug: "kits" })).data.project;
    db(`UPDATE creators SET trusted = 1, platform_fee_bps = 1000 WHERE id = '${creator.id}'`);
    const product = (await c.post(`/api/studio/projects/${project.id}/products`,
      { title: `Kit ${tag}`, type: "sample-pack", priceCents: 2000, description: "Drums.", includes: ["kicks"] })).data.product;
    assert.equal((await put(c, `/api/studio/products/${product.id}/files?filename=kit.zip`, ZIP)).status, 201);
    assert.equal((await c.req("PATCH", `/api/studio/products/${product.id}`, { body: { published: true } })).status, 200);
    if (firstParty) db(`UPDATE creators SET source = 'catalog' WHERE id = '${creator.id}'`);
    return { c, creator, project, product };
  }
  const line = (orderId) => db(`SELECT creator_id, net_cents, platform_fee_cents, creator_share_cents FROM order_items WHERE order_id = '${orderId}'`);

  test("a first-party sale records no fee and no creator share; a Studio creator's sale still splits", async () => {
    const own = await seller("own", { firstParty: true });
    const other = await seller("other", { firstParty: false });
    const { c: buyer } = await newBuyer(base(), "fp-buyer");
    const mine = await mockBuy(buyer, [{ productId: own.product.id }]);
    assert.deepEqual(line(mine.orderId), [{ creator_id: own.creator.id, net_cents: 2000, platform_fee_cents: 0, creator_share_cents: 0 }],
      "AutoStacc's own revenue: nothing to hold or pay out");
    const theirs = await mockBuy(buyer, [{ productId: other.product.id }]);
    assert.deepEqual(line(theirs.orderId), [{ creator_id: other.creator.id, net_cents: 2000, platform_fee_cents: 200, creator_share_cents: 1800 }]);
    assert.ok((await buyer.get("/api/library")).data.items.some((i) => i.productId === own.product.id), "the buyer owns it");
  });

  test("the Studio reports a first-party creator as unlimited, with no fee, and refuses it paid storage", async () => {
    const own = await seller("limits", { firstParty: true });
    const pricing = (await own.c.get(`/api/studio/products/${own.product.id}/pricing`)).data;
    assert.deepEqual([pricing.feeBps, pricing.firstParty, pricing.estimate.list.platformFeeCents, pricing.estimate.list.creatorShareCents], [0, true, 0, 2000]);
    const storage = await own.c.get(`/api/studio/creators/${own.creator.id}/storage`);
    assert.equal(storage.status, 200);
    assert.deepEqual([storage.data.storage.quotaBytes, storage.data.storage.unlimited, storage.data.storage.overLimit, storage.data.billing.available],
      [null, true, false, false]);
    const plan = await own.c.req("PUT", `/api/studio/creators/${own.creator.id}/storage/plan`, { body: { capCents: 500 } });
    assert.deepEqual([plan.status, plan.data.error.code], [409, "storage_unlimited"]);
    const ws = (await own.c.get(`/api/studio/products/${own.product.id}`)).data;
    assert.deepEqual([ws.limits.unlimited, ws.limits.filesPerProduct, ws.creator.firstParty], [true, null, true]);
    const listed = (await own.c.get(`/api/studio/projects/${own.project.id}/products`)).data.limits;
    assert.deepEqual([listed.unlimited, listed.products], [true, null]);
  });

  test("a first-party creator has no product limit; a Studio creator stops at the free plan's", async () => {
    const own = await seller("many", { firstParty: true });
    const other = await seller("capped", { firstParty: false });
    // Fill both to the free plan's 25 products (24 more rows beside the one each already has).
    for (const s of [own, other]) {
      const rows = Array.from({ length: 24 }, (_, i) => `('${s.product.id}-x${i}', 'Filler ${i}', 'other', 0, 'USD', '${s.project.id}', 'studio', '[]', 'x', 'x')`);
      db(`INSERT INTO products (id, title, type, price_cents, currency, project_id, source, pacs, created_at, updated_at) VALUES ${rows.join(", ")}`);
    }
    const make = (s) => s.c.post(`/api/studio/projects/${s.project.id}/products`, { title: "One More", type: "sample-pack", priceCents: 1500, description: "More.", includes: ["kicks"] });
    assert.equal((await make(own)).status, 201, "no cap for AutoStacc's own");
    const refused = await make(other);
    assert.deepEqual([refused.status, refused.data.error.code], [409, "limit_reached"]);
  });
});

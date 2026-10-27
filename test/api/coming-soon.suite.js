// Coming soon products (server/creators/coming-soon.js; owner, 2026-10-27, #218): a creator announces an unpublished
// product with a day; its page, API answer and store card say Coming soon; the cart, checkout and free claims refuse it;
// the daily sweep puts it on sale on the day when it's ready, and otherwise keeps it waiting and emails the owner once.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql, sqlAll, outbox } from "../support/client.js";
import { newBuyer } from "../support/flows.js";

export const SWEEP_TOKEN = "coming-soon-sweep-token-for-tests-".padEnd(40, "x");
const ZIP = Buffer.from("PK\u0003\u0004 sample pack", "latin1");
const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export default (ctx) => describe("coming soon", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);
  const one = (q) => sqlAll(ctx.mock.stateDir, q)[0][0];
  const sweep = () => fetch(`${base()}/api/internal/sweep`, { method: "POST", headers: { Authorization: `Bearer ${SWEEP_TOKEN}` } });

  async function seller(tag) {
    const { c, user } = await newBuyer(base(), tag);
    const email = user.email;
    const cr = await c.post("/api/studio/creators", { name: `Soon ${tag}`, slug: slug(tag) });
    const pr = await c.post(`/api/studio/creators/${cr.data.creator.id}/projects`, { name: "Beats", slug: "beats" });
    db(`UPDATE creators SET trusted = 1 WHERE id = '${cr.data.creator.id}'`);
    return { c, user, email, creator: cr.data.creator, project: pr.data.project };
  }
  const make = async (s, o = {}) => (await s.c.post(`/api/studio/projects/${s.project.id}/products`, { title: "Future Drums", type: "sample-pack", priceCents: 1500, description: "Soon.", ...o })).data.product;
  const patch = (s, p, body) => s.c.req("PATCH", `/api/studio/products/${p.id}`, { body });
  const upload = (s, p) => s.c.req("PUT", `/api/studio/products/${p.id}/files?filename=pack.zip`, { raw: ZIP, headers: { "Content-Type": "application/octet-stream" } });

  test("announcing: a day from tomorrow to a year ahead, without files; only for the team; never on a product on sale", async () => {
    const s = await seller("soon-a");
    const p = await make(s);
    for (const bad of [day(0), day(-3), day(400), "2026-13-01", "2026-02-30", "soon", 20261101]) {
      assert.equal((await patch(s, p, { comingSoonOn: bad })).status, 400, String(bad));
    }
    const other = await seller("soon-b");
    assert.equal((await patch(other, p, { comingSoonOn: day(5) })).status, 404, "not their product");
    assert.equal((await patch(s, p, { comingSoonOn: day(5), priceCents: 1 })).status, 400, "the price must be right to announce");
    const ok = await patch(s, p, { comingSoonOn: day(5) });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(one(`SELECT coming_soon_on AS d, published FROM products WHERE id = '${p.id}'`).d, day(5));
    // Public: the page, the API and the store list say Coming soon; nothing is for sale.
    const anon = new Client(base());
    const api = await anon.get(`/api/products/${p.id}`);
    assert.equal(api.status, 200);
    assert.deepEqual([api.data.product.comingSoon.on, api.data.product.available], [day(5), false]);
    const page = await anon.get(`/shop/${p.id}`);
    assert.equal(page.status, 200);
    assert.match(page.data, /Coming soon/);
    assert.doesNotMatch(page.data, /data-buy>/);
    assert.ok((await anon.get("/api/products")).data.products.some((x) => x.id === p.id && x.comingSoon));
    // Taking it back makes it a plain draft again, gone from the public.
    assert.equal((await patch(s, p, { comingSoonOn: null })).status, 200);
    assert.equal((await anon.get(`/api/products/${p.id}`)).status, 404);
    // A product on sale can't be announced.
    assert.equal((await upload(s, p)).status, 201);
    assert.equal((await patch(s, p, { published: true })).status, 200);
    assert.equal((await patch(s, p, { comingSoonOn: day(3) })).data.error.code, "already_on_sale");
  });

  test("nothing Coming soon can be bought or claimed, whatever the browser sends", async () => {
    const s = await seller("soon-c");
    const paid = await make(s);
    const free = await make(s, { title: "Future Freebie", priceCents: 0 });
    for (const p of [paid, free]) {
      assert.equal((await upload(s, p)).status, 201);
      assert.equal((await patch(s, p, { comingSoonOn: day(2) })).status, 200);
    }
    const buyer = await newBuyer(base(), "soon-buyer");
    const cart = await buyer.c.post("/api/cart/price", { items: [{ productId: paid.id, quantity: 1 }] });
    assert.ok(cart.status >= 400 || !JSON.stringify(cart.data).includes('"total":1500'), JSON.stringify(cart.data).slice(0, 300));
    const checkout = await buyer.c.post("/api/checkout", { items: [{ productId: paid.id, quantity: 1 }] });
    assert.ok(checkout.status >= 400, `checkout refused (${checkout.status})`);
    const claim = await buyer.c.post("/api/library/free", { productId: free.id });
    assert.ok(claim.status >= 400, `free claim refused (${claim.status})`);
    assert.equal(one(`SELECT COUNT(*) AS n FROM entitlements WHERE product_id IN ('${paid.id}', '${free.id}')`).n, 0);
  });

  test("on the day the sweep puts a ready product on sale; one that isn't stays Coming soon and the owner is emailed once", async () => {
    const s = await seller("soon-d");
    const ready = await make(s, { title: "Ready Drums" });
    const late = await make(s, { title: "Late Drums" });
    assert.equal((await upload(s, ready)).status, 201);
    for (const p of [ready, late]) assert.equal((await patch(s, p, { comingSoonOn: day(1) })).status, 200);
    // The day comes.
    db(`UPDATE products SET coming_soon_on = '${day(0)}' WHERE id IN ('${ready.id}', '${late.id}')`);
    assert.equal((await sweep()).status, 200);
    assert.deepEqual([one(`SELECT published, coming_soon_on AS d FROM products WHERE id = '${ready.id}'`).published, one(`SELECT coming_soon_on AS d FROM products WHERE id = '${ready.id}'`).d], [1, null]);
    assert.equal((await new Client(base()).get(`/api/products/${ready.id}`)).data.product.available, true);
    const l = one(`SELECT published, coming_soon_on AS d FROM products WHERE id = '${late.id}'`);
    assert.deepEqual([l.published, l.d], [0, day(0)], "still Coming soon");
    assert.equal((await sweep()).status, 200);
    const mails = (await outbox(base(), s.email)).filter((m) => m.kind === "coming-soon-blocked");
    assert.equal(mails.length, 1, "emailed once for that day");
    // Once its file is in, the next sweep puts it on sale.
    assert.equal((await upload(s, late)).status, 201);
    assert.equal((await sweep()).status, 200);
    assert.equal(one(`SELECT published FROM products WHERE id = '${late.id}'`).published, 1);
  });

  test("Needs you lists what waits in a creator's products, for its product team only", async () => {
    const s = await seller("soon-att");
    const draft = await make(s, { title: "Plain Draft" });
    const soon = await make(s, { title: "Soon Drums" });
    assert.equal((await patch(s, soon, { comingSoonOn: day(4) })).status, 200);
    const r = await s.c.get(`/api/studio/creators/${s.creator.id}/attention`);
    assert.equal(r.status, 200);
    const kinds = Object.fromEntries(r.data.items.map((x) => [x.productId, x.kind]));
    assert.deepEqual([kinds[draft.id], kinds[soon.id]], ["draft", "coming_soon"]);
    assert.ok(r.data.items.every((x) => x.href.startsWith("#product=")));
    const other = await seller("soon-att-b");
    assert.equal((await other.c.get(`/api/studio/creators/${s.creator.id}/attention`)).status, 404, "not their creator");
    assert.equal((await new Client(base()).get(`/api/studio/creators/${s.creator.id}/attention`)).status, 401);
    // The summary for the bell and the home: every creator of this person, drafts and Coming soon waiting but not
    // needing them; nobody else's creators.
    const sum = await s.c.get("/api/studio/attention");
    assert.equal(sum.status, 200);
    assert.equal(sum.data.member, true);
    const mine = sum.data.creators.find((c) => c.id === s.creator.id);
    assert.deepEqual([mine.waiting >= 2, mine.needsYou], [true, 0]);
    assert.ok(!(await other.c.get("/api/studio/attention")).data.creators.some((c) => c.id === s.creator.id));
    assert.equal((await new Client(base()).get("/api/studio/attention")).status, 401);
    // On sale: no longer waiting.
    assert.equal((await upload(s, draft)).status, 201);
    assert.equal((await patch(s, draft, { published: true })).status, 200);
    assert.ok(!(await s.c.get(`/api/studio/creators/${s.creator.id}/attention`)).data.items.some((x) => x.productId === draft.id));
  });
});

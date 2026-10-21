// Creators selling (docs/creators.md#selling): making products for their own projects with checked prices and kinds,
// artwork that must be their own image, paid files that must be what their name says and wait for approval unless the
// creator is trusted, a product that only goes on sale with a file a buyer can download, the seller split on real orders,
// earnings with refunds and the 14-day hold, payout requests (one open at a time, only what has cleared), the admin
// settling them, and nobody reaching another creator's products, files, earnings or payouts.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql, outbox } from "../support/client.js";
import { newBuyer, mockBuy, adminClient } from "../support/flows.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const ZIP = Buffer.from("PK\u0003\u0004 sample pack", "latin1");
const MP3 = Buffer.from("ID3\u0003\u0000\u0000\u0000\u0000\u0000\u0000 a preview", "latin1");
const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

async function seller(base, tag) {
  const { c, user } = await newBuyer(base, tag);
  const cr = await c.post("/api/studio/creators", { name: `Seller ${tag}`, slug: slug(tag) });
  assert.equal(cr.status, 201, JSON.stringify(cr.data));
  const pr = await c.post(`/api/studio/creators/${cr.data.creator.id}/projects`, { name: "Beats", slug: "beats" });
  assert.equal(pr.status, 201);
  return { c, user, creator: cr.data.creator, project: pr.data.project };
}
const input = (o = {}) => ({ title: "Dusty Drums", type: "sample-pack", priceCents: 2000, description: "Warm, dusty one-shots.", includes: ["40 kicks", "60 snares"], tags: ["drums"], ...o });
const make = (s, o) => s.c.post(`/api/studio/projects/${s.project.id}/products`, input(o));
const put = (client, path, raw) => client.req("PUT", path, { raw, headers: { "Content-Type": "application/octet-stream" } });

export default (ctx) => describe("selling", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);

  test("making a product: only for your own project, only valid prices and kinds, starts as a draft", async () => {
    const s = await seller(base(), "maker");
    const other = await seller(base(), "other-maker");
    const anon = new Client(base());
    assert.equal((await anon.post(`/api/studio/projects/${s.project.id}/products`, input())).status, 401);
    assert.equal((await other.c.post(`/api/studio/projects/${s.project.id}/products`, input())).status, 404, "someone else's project");
    assert.equal((await other.c.get(`/api/studio/projects/${s.project.id}/products`)).status, 404);
    assert.equal((await s.c.post(`/api/studio/projects/no-such-project/products`, input())).status, 404);

    const ok = await make(s);
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    const p = ok.data.product;
    assert.ok(p.id.startsWith(s.creator.slug + "-dusty-drums"));
    assert.equal(p.published, false);
    assert.equal(p.path, `/shop/${p.id}`);
    assert.deepEqual(db(`SELECT source, created_by, project_id, published FROM products WHERE id = '${p.id}'`), [{ source: "studio", created_by: s.user.id, project_id: s.project.id, published: 0 }]);
    // Not visible to buyers until it is on sale.
    assert.equal((await anon.get(`/api/products/${p.id}`)).status, 404);

    for (const bad of [{ priceCents: 50 }, { priceCents: 99 }, { priceCents: 50001 }, { priceCents: 19.99 }, { priceCents: "20" }, { priceCents: -1 }, { priceCents: null },
      { type: "malware" }, { type: "" }, { title: "ab" }, { title: "x".repeat(81) }, { tags: ["Has Spaces"] }, { tags: Array(9).fill("a") },
      { includes: Array(13).fill("x") }, { includes: [""] }, { description: "y".repeat(2001) }, { published: true }, { deleted: true }, { salesPaused: true }]) {
      const r = await make(s, bad);
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
    // Free is allowed, and so is the edge of each price bound.
    for (const priceCents of [0, 100, 50000]) assert.equal((await make(s, { title: `Edge ${priceCents}`, priceCents })).status, 201, String(priceCents));
  });

  test("a creator can have only so many products, checked in the insert", async () => {
    const s = await seller(base(), "many");
    for (let i = 0; i < 25; i++) assert.equal((await make(s, { title: `Pack number ${i}` })).status, 201, String(i));
    const over = await make(s, { title: "One too many" });
    assert.equal(over.status, 409);
    assert.equal(over.data.error.code, "limit_reached");
  });

  test("editing: price, text and artwork; someone else's product and image are off limits", async () => {
    const s = await seller(base(), "editor");
    const t = await seller(base(), "thief");
    const p = (await make(s)).data.product;
    const patch = (client, body, id = p.id) => client.req("PATCH", `/api/studio/products/${id}`, { body });

    assert.equal((await patch(t.c, { priceCents: 100 })).status, 404, "another creator can't change it");
    assert.equal((await patch(new Client(base()), { priceCents: 100 })).status, 401);
    assert.equal((await patch(s.c, {})).status, 400, "nothing to change");
    assert.equal((await patch(s.c, { priceCents: 2500, title: "Dusty Drums 2", description: "New text", includes: ["a", "b"] })).status, 200);
    assert.deepEqual(db(`SELECT price_cents, title, description FROM products WHERE id = '${p.id}'`), [{ price_cents: 2500, title: "Dusty Drums 2", description: "New text" }]);
    assert.equal((await patch(s.c, { priceCents: 5 })).status, 400);

    const img = await put(s.c, `/api/studio/creators/${s.creator.id}/images?filename=cover.png`, PNG);
    assert.equal(img.status, 201);
    const theirImg = await put(t.c, `/api/studio/creators/${t.creator.id}/images?filename=cover.png`, PNG);
    assert.equal((await patch(s.c, { artworkId: theirImg.data.image.id })).status, 400, "not your image");
    assert.equal((await patch(s.c, { artworkId: "as_nope" })).status, 400);
    assert.equal((await patch(s.c, { artworkId: img.data.image.id })).status, 200);
    assert.equal(db(`SELECT artwork FROM products WHERE id = '${p.id}'`)[0].artwork, img.data.image.src);
    assert.equal((await patch(s.c, { artworkId: null })).status, 200);
    assert.equal(db(`SELECT artwork FROM products WHERE id = '${p.id}'`)[0].artwork, null);

    // Tags, and a preview clip: audio only, contents must match, only the owner, replaced cleanly, removable.
    assert.equal((await patch(s.c, { tags: ["lo-fi", "drums"] })).status, 200);
    assert.equal((await patch(s.c, { tags: ["Not OK!"] })).status, 400);
    const pv = (client, name, raw) => put(client, `/api/studio/products/${p.id}/preview?filename=${encodeURIComponent(name)}`, raw);
    assert.equal((await pv(s.c, "clip.zip", ZIP)).status, 415);
    assert.equal((await pv(s.c, "clip.mp3", ZIP)).status, 415, "not really audio");
    assert.equal((await pv(t.c, "clip.mp3", MP3)).status, 404, "not their product");
    const first = await pv(s.c, "clip.mp3", MP3);
    assert.equal(first.status, 201, JSON.stringify(first.data));
    assert.match(first.data.preview, new RegExp(`^/media/previews/${p.id}-[a-z2-7]+\\.mp3$`));
    const second = await pv(s.c, "clip.mp3", MP3);
    assert.notEqual(second.data.preview, first.data.preview, "a new name each time, so caches never serve the old clip");
    assert.equal(db(`SELECT preview FROM products WHERE id = '${p.id}'`)[0].preview, second.data.preview);
    assert.equal((await s.c.req("DELETE", `/api/studio/products/${p.id}/preview`)).status, 200);
    assert.equal(db(`SELECT preview FROM products WHERE id = '${p.id}'`)[0].preview, null);
  });

  test("the store lists creators' products with who made them, marked unverified until the creator is trusted", async () => {
    const s = await seller(base(), "listed");
    const p = (await make(s, { title: "Listed Pack" })).data.product;
    assert.equal((await put(s.c, `/api/studio/products/${p.id}/files?filename=pack.zip`, ZIP)).status, 201);
    db(`UPDATE product_files SET status = 'published' WHERE product_id = '${p.id}'`);
    assert.equal((await s.c.req("PATCH", `/api/studio/products/${p.id}`, { body: { published: true } })).status, 200);
    const listed = async () => (await new Client(base()).get("/api/products")).data.products.find((x) => x.id === p.id);
    let x = await listed();
    assert.ok(x, "in the store");
    assert.deepEqual([x.source, x.verified, x.projectName, x.creator.path, x.projectPath, x.path],
      ["studio", false, "Beats", `/${s.creator.slug}`, `/${s.creator.slug}/beats`, `/shop/${p.id}`]);
    assert.equal((await new Client(base()).get(`/api/products/${p.id}`)).data.product.verified, false);
    db(`UPDATE creators SET trusted = 1 WHERE id = '${s.creator.id}'`);
    x = await listed();
    assert.equal(x.verified, true, "trusted creators lose the label");
    const own = (await new Client(base()).get("/api/products")).data.products.find((y) => y.source === "catalog");
    assert.equal(own.verified, true, "AutoStacc's own products are verified");
  });

  test("files: only listed types whose bytes match; wait for approval unless trusted; nobody else's product", async () => {
    const s = await seller(base(), "uploader");
    const t = await seller(base(), "intruder");
    const p = (await make(s)).data.product;
    const up = (client, name, raw, id = p.id) => put(client, `/api/studio/products/${id}/files?filename=${encodeURIComponent(name)}`, raw);

    for (const name of ["evil.exe", "page.html", "image.svg", "run.js", "x.php", "noext"]) assert.equal((await up(s.c, name, ZIP)).status, 415, name);
    const lie = await up(s.c, "pack.zip", "<html><script>alert(1)</script></html>");
    assert.equal(lie.status, 415);
    assert.equal(lie.data.error.code, "content_mismatch");
    assert.equal(db(`SELECT COUNT(*) AS n FROM product_files WHERE product_id = '${p.id}'`)[0].n, 0, "a rejected file leaves nothing");
    assert.equal((await up(t.c, "pack.zip", ZIP)).status, 404, "not your product");
    assert.equal((await up(new Client(base()), "pack.zip", ZIP)).status, 401);

    const good = await up(s.c, "pack.zip", ZIP);
    assert.equal(good.status, 201);
    assert.equal(good.data.file.status, "pending", "an untrusted creator's file waits for approval");
    const alerts = (await outbox(base(), "admin@autostacc.test")).filter((m) => m.kind === "admin-alert" && m.body_text.includes(`/${s.creator.slug})`) && m.body_text.includes(good.data.file.filename));
    assert.equal(alerts.length, 1, "the admins are told a file is waiting");
    assert.equal(db(`SELECT content_type FROM product_files WHERE id = '${good.data.file.id}'`)[0].content_type, "application/zip");

    // Not deliverable yet, so it can't go on sale.
    const sale = await s.c.req("PATCH", `/api/studio/products/${p.id}`, { body: { published: true } });
    assert.equal(sale.status, 409);
    assert.equal(sale.data.error.code, "needs_file");

    // The owner approves it; now it can.
    const admin = await adminClient(base());
    assert.equal((await admin.req("PATCH", `/api/admin/files/${good.data.file.id}`, { body: { status: "published" } })).status, 200);
    assert.equal((await s.c.req("PATCH", `/api/studio/products/${p.id}`, { body: { published: true } })).status, 200);
    const live = await new Client(base()).get(`/api/products/${p.id}`);
    assert.equal(live.status, 200);
    assert.equal(live.data.product.priceCents, 2000);

    // Rejecting or removing the last deliverable file takes it back off sale.
    assert.equal((await admin.req("PATCH", `/api/admin/files/${good.data.file.id}`, { body: { status: "rejected" } })).status, 200);
    assert.equal((await new Client(base()).get(`/api/products/${p.id}`)).status, 404);

    // A trusted creator's files are delivered at once; removing one by its owner works, someone else's can't.
    db(`UPDATE creators SET trusted = 1 WHERE id = '${s.creator.id}'`);
    const fast = await up(s.c, "more.zip", ZIP);
    assert.equal(fast.data.file.status, "published");
    assert.equal((await t.c.req("DELETE", `/api/studio/products/${p.id}/files/${fast.data.file.id}`)).status, 404);
    assert.equal((await s.c.req("PUT", `/api/studio/products/${p.id}/files?filename=pack.zip`, { raw: ZIP })).status, 201);
    assert.equal((await s.c.req("PATCH", `/api/studio/products/${p.id}`, { body: { published: true } })).status, 200);
    assert.equal((await s.c.req("DELETE", `/api/studio/products/${p.id}/files/${fast.data.file.id}`)).status, 200);
  });

  test("paid-file storage: an admin-set quota for a creator replaces the free plan's, and nothing over it is kept", async () => {
    const s = await seller(base(), "quota");
    const p = (await make(s)).data.product;
    const up = (name) => put(s.c, `/api/studio/products/${p.id}/files?filename=${encodeURIComponent(name)}`, ZIP);
    assert.equal((await up("one.zip")).status, 201, "the free plan's quota has room");
    db(`UPDATE creators SET files_quota_bytes = ${ZIP.length + 10} WHERE id = '${s.creator.id}'`);
    const over = await up("two.zip");
    assert.equal(over.status, 409);
    assert.equal(over.data.error.code, "quota_exceeded");
    assert.equal(db(`SELECT COUNT(*) AS n FROM product_files WHERE product_id = '${p.id}' AND active = 1`)[0].n, 1, "the refused file left no row");
    db(`UPDATE creators SET files_quota_bytes = NULL WHERE id = '${s.creator.id}'`);
    assert.equal((await up("two.zip")).status, 201, "back on the free plan's quota");
  });

  test("a sale: the seller split is recorded, the buyer gets the file, and earnings, hold and payouts follow", async () => {
    const s = await seller(base(), "earner");
    const stranger = await seller(base(), "nosy");
    db(`UPDATE creators SET trusted = 1, platform_fee_bps = 1000 WHERE id = '${s.creator.id}'`);
    const p = (await make(s, { title: "Big Pack", priceCents: 2000 })).data.product;
    assert.equal((await put(s.c, `/api/studio/products/${p.id}/files?filename=big.zip`, ZIP)).status, 201);
    assert.equal((await s.c.req("PATCH", `/api/studio/products/${p.id}`, { body: { published: true } })).status, 200);

    // Pausing sales stops checkout; resuming allows it.
    const { c: buyer, user: buyerUser } = await newBuyer(base(), "buyer-of-big");
    assert.equal((await s.c.req("PATCH", `/api/studio/products/${p.id}`, { body: { salesPaused: true } })).status, 200);
    assert.notEqual((await buyer.post("/api/checkout", { items: [{ productId: p.id }] })).status, 201, "paused products can't be bought");
    assert.equal((await s.c.req("PATCH", `/api/studio/products/${p.id}`, { body: { salesPaused: false } })).status, 200);

    // The price in the cart comes from the database, whatever the browser says.
    const order = await mockBuy(buyer, [{ productId: p.id, priceCents: 1, unitPriceCents: 1 }]);
    const items = db(`SELECT creator_id, unit_price_cents, net_cents, platform_fee_cents, creator_share_cents FROM order_items WHERE order_id = '${order.orderId}'`);
    assert.deepEqual(items, [{ creator_id: s.creator.id, unit_price_cents: 2000, net_cents: 2000, platform_fee_cents: 200, creator_share_cents: 1800 }]);
    const owned = (await buyer.get("/api/library")).data.items.find((i) => i.productId === p.id);
    assert.ok(owned, "the buyer owns it");
    // Your Stacc names the Studio project and links to the product's real page.
    assert.equal(owned.projectName, "Beats");
    assert.equal(owned.path, `/shop/${p.id}`);
    assert.equal((await buyer.get("/api/orders")).data.orders.find((o) => o.id === order.orderId).items[0].path, `/shop/${p.id}`);

    // Earnings: just paid, so on hold and not yet payable. No buyer is named.
    const e1 = (await s.c.get(`/api/studio/creators/${s.creator.id}/earnings`)).data.earnings;
    assert.equal(e1.salesCount, 1);
    assert.equal(e1.shareCents, 1800);
    assert.equal(e1.platformFeeCents, 200);
    assert.equal(e1.onHoldCents, 1800);
    assert.equal(e1.availableCents, 0);
    assert.ok(!JSON.stringify(e1).includes(buyerUser.email) && !JSON.stringify(e1).includes(buyerUser.id), "no buyer is named in the answer");
    const noMoney = await s.c.post(`/api/studio/creators/${s.creator.id}/payouts`, { details: "PayPal: me@seller.test" });
    assert.equal(noMoney.status, 409);
    assert.equal(noMoney.data.error.code, "below_minimum");

    // Other people can't see or ask for anything.
    assert.equal((await stranger.c.get(`/api/studio/creators/${s.creator.id}/earnings`)).status, 404);
    assert.equal((await stranger.c.post(`/api/studio/creators/${s.creator.id}/payouts`, { details: "PayPal: thief@x.test" })).status, 404);
    assert.equal((await new Client(base()).get(`/api/studio/creators/${s.creator.id}/earnings`)).status, 401);

    // A test-mode order never counts: flip it to live-money and it would; here we prove the reverse by hiding it.
    db(`UPDATE orders SET livemode = 1 WHERE id = '${order.orderId}'`);
    assert.equal((await s.c.get(`/api/studio/creators/${s.creator.id}/earnings`)).data.earnings.salesCount, 0, "orders from another mode don't count");
    db(`UPDATE orders SET livemode = 0 WHERE id = '${order.orderId}'`);

    // After the hold it clears.
    db(`UPDATE orders SET paid_at = '${daysAgo(20)}' WHERE id = '${order.orderId}'`);
    const e2 = (await s.c.get(`/api/studio/creators/${s.creator.id}/earnings`)).data.earnings;
    assert.deepEqual([e2.onHoldCents, e2.clearedCents, e2.availableCents], [0, 1800, 1800]);

    // A partial refund takes its proportion off; a full one takes it all.
    db(`UPDATE orders SET refunded_cents = 1000 WHERE id = '${order.orderId}'`);
    assert.equal((await s.c.get(`/api/studio/creators/${s.creator.id}/earnings`)).data.earnings.availableCents, 900);
    db(`UPDATE orders SET refunded_cents = 0 WHERE id = '${order.orderId}'`);

    // Asking: details required, the amount is what the server says is available, one open request at a time.
    for (const details of [undefined, "", "abc", "x".repeat(201), 5]) assert.equal((await s.c.post(`/api/studio/creators/${s.creator.id}/payouts`, { details })).status, 400, String(details));
    const ask = await s.c.post(`/api/studio/creators/${s.creator.id}/payouts`, { details: "PayPal: me@seller.test", amountCents: 999999 });
    assert.ok((await outbox(base(), "admin@autostacc.test")).some((m) => m.kind === "admin-alert" && m.body_text.includes(s.creator.slug) && m.subject.includes("payout")),
      "the admins are told about the payout request");
    assert.equal(ask.status, 201);
    assert.equal(ask.data.payout.amountCents, 1800, "the client can't choose the amount");
    const twice = await s.c.post(`/api/studio/creators/${s.creator.id}/payouts`, { details: "PayPal: me@seller.test" });
    assert.equal(twice.status, 409);
    assert.equal(twice.data.error.code, "payout_open");
    assert.equal((await s.c.get(`/api/studio/creators/${s.creator.id}/earnings`)).data.earnings.availableCents, 0);

    // The admin sees it with the payment details; customers and creators don't.
    const admin = await adminClient(base());
    const list = await admin.get("/api/admin/payouts?status=requested");
    const mine = list.data.payouts.find((x) => x.id === ask.data.payout.id);
    assert.equal(mine.details, "PayPal: me@seller.test");
    assert.equal(mine.creator.slug, s.creator.slug);
    assert.equal((await s.c.get("/api/admin/payouts")).status, 404);
    assert.equal((await s.c.req("PATCH", `/api/admin/payouts/${ask.data.payout.id}`, { body: { status: "paid" } })).status, 404, "creators can't pay themselves");
    assert.equal((await admin.req("PATCH", `/api/admin/payouts/${ask.data.payout.id}`, { body: { status: "maybe" } })).status, 400);
    assert.equal((await admin.req("PATCH", `/api/admin/payouts/${ask.data.payout.id}`, { body: { status: "paid", note: "Sent by PayPal" } })).status, 200);
    const settled = (await outbox(base(), s.user.email)).filter((m) => m.kind === "payout-settled");
    assert.equal(settled.length, 1, "the creator hears it was paid");
    assert.match(settled[0].body_text, /Sent by PayPal/);
    assert.equal((await admin.req("PATCH", `/api/admin/payouts/${ask.data.payout.id}`, { body: { status: "declined" } })).status, 404, "settled once");
    const after = (await s.c.get(`/api/studio/creators/${s.creator.id}/earnings`)).data;
    assert.equal(after.earnings.paidOutCents, 1800);
    assert.equal(after.earnings.availableCents, 0);
    assert.equal(after.payouts[0].status, "paid");
    assert.equal(db(`SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'payout.paid' AND target_id = '${ask.data.payout.id}'`)[0].n, 1);
  });

  test("a declined payout returns to the balance; a refunded sale pays nothing", async () => {
    const s = await seller(base(), "refunded");
    db(`UPDATE creators SET trusted = 1 WHERE id = '${s.creator.id}'`);
    const p = (await make(s, { title: "Refund Pack", priceCents: 3000 })).data.product;
    await put(s.c, `/api/studio/products/${p.id}/files?filename=r.zip`, ZIP);
    await s.c.req("PATCH", `/api/studio/products/${p.id}`, { body: { published: true } });
    const { c: buyer } = await newBuyer(base(), "refund-buyer");
    const order = await mockBuy(buyer, [{ productId: p.id }]);
    db(`UPDATE orders SET paid_at = '${daysAgo(30)}' WHERE id = '${order.orderId}'`);
    const ask = await s.c.post(`/api/studio/creators/${s.creator.id}/payouts`, { details: "Bank: details on request" });
    assert.equal(ask.status, 201);
    const admin = await adminClient(base());
    assert.equal((await admin.req("PATCH", `/api/admin/payouts/${ask.data.payout.id}`, { body: { status: "declined", note: "Call me" } })).status, 200);
    assert.equal((await s.c.get(`/api/studio/creators/${s.creator.id}/earnings`)).data.earnings.availableCents, 2400, "declined money is available again");
    db(`UPDATE orders SET status = 'refunded', refunded_cents = 3000 WHERE id = '${order.orderId}'`);
    const e = (await s.c.get(`/api/studio/creators/${s.creator.id}/earnings`)).data.earnings;
    assert.deepEqual([e.shareCents, e.availableCents], [0, 0]);
  });

  test("suspending a creator or deleting a project takes its products off sale; buyers keep what they own", async () => {
    const s = await seller(base(), "suspended");
    db(`UPDATE creators SET trusted = 1 WHERE id = '${s.creator.id}'`);
    const mk = async (title) => {
      const p = (await make(s, { title })).data.product;
      await put(s.c, `/api/studio/products/${p.id}/files?filename=a.zip`, ZIP);
      await s.c.req("PATCH", `/api/studio/products/${p.id}`, { body: { published: true } });
      return p;
    };
    const a = await mk("Suspend Pack");
    const { c: buyer } = await newBuyer(base(), "keeper");
    await mockBuy(buyer, [{ productId: a.id }]);
    const admin = await adminClient(base());
    assert.equal((await admin.req("PATCH", `/api/admin/creators/${s.creator.id}`, { body: { status: "suspended" } })).status, 200);
    assert.equal((await new Client(base()).get(`/api/products/${a.id}`)).status, 404, "off sale");
    assert.ok((await buyer.get("/api/library")).data.items.some((i) => i.productId === a.id), "the buyer still owns it");
    assert.equal(((await s.c.req("PATCH", `/api/studio/products/${a.id}`, { body: { priceCents: 500 } })).status), 403, "suspended creators can't change anything");
    assert.equal((await admin.req("PATCH", `/api/admin/creators/${s.creator.id}`, { body: { status: "active" } })).status, 200);

    const b = await mk("Project Pack");
    assert.equal((await s.c.req("DELETE", `/api/studio/projects/${s.project.id}`, { body: { confirm: s.project.slug } })).status, 200);
    assert.equal((await new Client(base()).get(`/api/products/${b.id}`)).status, 404);
  });
});

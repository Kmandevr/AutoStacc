// The community library (docs/builder.md, phase 8): only trusted creators share, with their own files only and
// nothing personal (products, projects, audio players); anyone's sites can use free pieces and show their files; a paid
// piece is a store product of type "template" that must be bought first; deleting a piece keeps it working where it's
// used and stops it counting against its creator; reports reach the Control Center, whose takedown hides a piece's
// files everywhere and takes it off sale; restoring brings it back.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql } from "../support/client.js";
import { newBuyer, mockBuy, adminClient } from "../support/flows.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const img = (asset) => ({ id: "i1", type: "image", asset, alt: "art", box: { x: 0, y: 0, w: 6, h: 6 } });
const v2 = (elements) => ({ document: { version: 2, theme: {}, nav: { items: [] }, pages: [{ slug: "", title: "Home", sections: [{ id: "s1", rows: 10, elements }] }] } });

export default (ctx) => describe("community library", () => {
  const base = () => ctx.mock.url;
  async function creator(tag, { trusted = false } = {}) {
    const { c, user } = await newBuyer(base(), tag);
    const cr = (await c.post("/api/studio/creators", { name: `Lib ${tag}`, slug: slug(tag) })).data.creator;
    const pr = (await c.post(`/api/studio/creators/${cr.id}/projects`, { name: "Kits", slug: "kits" })).data.project;
    if (trusted) assert.equal((await (await adminClient(base())).req("PATCH", `/api/admin/creators/${cr.id}`, { body: { trusted: true } })).status, 200);
    const image = (await c.req("PUT", `/api/studio/creators/${cr.id}/images?filename=a.png`, { raw: PNG, headers: { "Content-Type": "image/png" } })).data.image;
    return { c, user, creator: cr, project: pr, image };
  }
  const shareBody = (s, extra = {}) => ({ kind: "section", title: "Hero with art", description: "A banner", piece: { id: "s9", rows: 10, elements: [img(s.image.id),
    { id: "p1", type: "products", title: "Mine", ids: ["anything"], box: { x: 6, y: 0, w: 6, h: 4 } },
    { id: "f1", type: "follow", project: s.project.id, box: { x: 6, y: 5, w: 6, h: 2 } }] }, ...extra });

  test("only trusted creators share, with their own files only; what's personal is left out", async () => {
    const untrusted = await creator("lib-new");
    assert.equal((await untrusted.c.post(`/api/studio/creators/${untrusted.creator.id}/library`, shareBody(untrusted))).data.error.code, "not_trusted");
    const s = await creator("lib-seller", { trusted: true });
    const foreign = await s.c.post(`/api/studio/creators/${s.creator.id}/library`, shareBody(s, { piece: { id: "s9", rows: 6, elements: [img(untrusted.image.id)] } }));
    assert.equal(foreign.status, 400, "someone else's image can't be shared");
    assert.equal((await s.c.post(`/api/studio/creators/${s.creator.id}/library`, { ...shareBody(s), kind: "page" })).status, 400);
    const ok = await s.c.post(`/api/studio/creators/${s.creator.id}/library`, shareBody(s));
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    const piece = JSON.parse(sql(ctx.mock.stateDir, `SELECT fragment FROM library_pieces WHERE id = '${ok.data.piece.id}'`)[0].fragment);
    assert.deepEqual(piece.elements.map((e) => e.type), ["image", "products"], "the follow button is left out");
    assert.deepEqual(piece.elements[1].ids, [], "and so are the creator's products");
    // Members whose role can't share: an editor.
    const { c: ed, user: edUser } = await newBuyer(base(), "lib-editor");
    sql(ctx.mock.stateDir, `INSERT INTO creator_members (creator_id, user_id, role, created_at) VALUES ('${s.creator.id}', '${edUser.id}', 'editor', '2026-01-01T00:00:00.000Z')`);
    assert.equal((await ed.post(`/api/studio/creators/${s.creator.id}/library`, shareBody(s))).status, 404);
  });

  test("a free piece: anyone browses it, installs it, and their site shows its image; a site that didn't install it can't", async () => {
    const s = await creator("lib-free", { trusted: true });
    const id = (await s.c.post(`/api/studio/creators/${s.creator.id}/library`, shareBody(s))).data.piece.id;
    const u = await creator("lib-user");
    const listed = (await u.c.get(`/api/studio/library?creatorId=${u.creator.id}&kind=section`)).data.pieces.find((p) => p.id === id);
    assert.ok(listed && listed.owned, "free pieces are usable");
    assert.equal(listed.files[0].id, s.image.id);
    const got = await u.c.post(`/api/studio/creators/${u.creator.id}/library/${id}/install`, {});
    assert.equal(got.status, 200, JSON.stringify(got.data));
    assert.equal(got.data.fragment.elements[0].asset, s.image.id);
    await u.c.req("PUT", `/api/studio/projects/${u.project.id}/site`, { body: v2([img(s.image.id)]) });
    assert.match((await u.c.get(`/api/studio/projects/${u.project.id}/preview`)).data, new RegExp(`/media/sites/${s.image.id}`));
    const other = await creator("lib-other");
    await other.c.req("PUT", `/api/studio/projects/${other.project.id}/site`, { body: v2([img(s.image.id)]) });
    assert.ok(!new RegExp(s.image.id).test((await other.c.get(`/api/studio/projects/${other.project.id}/preview`)).data), "not installed: not shown");
    assert.equal((await new Client(base()).get("/api/studio/library")).status, 401);
  });

  test("a paid piece is a store product of type template: install only after buying it", async () => {
    const s = await creator("lib-paid", { trusted: true });
    const made = await s.c.post(`/api/studio/creators/${s.creator.id}/library`, shareBody(s, { priceCents: 900, projectId: s.project.id }));
    assert.equal(made.status, 201, JSON.stringify(made.data));
    const row = sql(ctx.mock.stateDir, `SELECT p.product_id, d.type, d.published, d.price_cents FROM library_pieces p JOIN products d ON d.id = p.product_id WHERE p.id = '${made.data.piece.id}'`)[0];
    assert.deepEqual([row.type, row.published, row.price_cents], ["template", 1, 900]);
    const u = await creator("lib-buyer");
    // Before buying: the layout only, never the words, settings or images.
    const seen = (await u.c.get(`/api/studio/library?creatorId=${u.creator.id}`)).data.pieces.find((p) => p.id === made.data.piece.id);
    assert.equal(seen.owned, false);
    assert.equal(seen.fragment, undefined);
    assert.deepEqual(seen.files, []);
    assert.ok(seen.outline.elements.every((e) => e.type === "spacer" && !e.asset && !e.text), JSON.stringify(seen.outline));
    assert.ok(!JSON.stringify(seen).includes(s.image.id), "no file of a paid piece reaches a non-buyer");
    const refused = await u.c.post(`/api/studio/creators/${u.creator.id}/library/${made.data.piece.id}/install`, {});
    assert.equal(refused.status, 402);
    assert.equal(refused.data.error.code, "buy_first");
    const order = await mockBuy(u.c, [{ productId: row.product_id }]);
    assert.equal(order.pay.status, 200, JSON.stringify(order.pay.data));
    assert.equal((await u.c.post(`/api/studio/creators/${u.creator.id}/library/${made.data.piece.id}/install`, {})).status, 200);
    assert.equal((await s.c.post(`/api/studio/creators/${s.creator.id}/library/${made.data.piece.id}/install`, {})).status, 200, "its creator uses it free");
    // A refund that claimed the order first wins over a use at the same moment.
    sql(ctx.mock.stateDir, `UPDATE orders SET refund_claimed_at = '2026-01-01T00:00:00.000Z' WHERE id = '${order.orderId}'`);
    assert.equal((await u.c.post(`/api/studio/creators/${u.creator.id}/library/${made.data.piece.id}/install`, {})).data.error.code, "refund_in_progress");
    sql(ctx.mock.stateDir, `UPDATE orders SET refund_claimed_at = NULL WHERE id = '${order.orderId}'`);
    // Using it counts like a download: the buyer can't refund it and keep it.
    const back = await u.c.post(`/api/orders/${order.orderId}/refund`, {});
    assert.equal(back.status, 409);
    assert.equal(back.data.error.reason, "downloaded");
    // And if the purchase goes away (an admin refund, say), the buyer's sites stop showing its files.
    await u.c.req("PUT", `/api/studio/projects/${u.project.id}/site`, { body: v2([img(s.image.id)]) });
    assert.match((await u.c.get(`/api/studio/projects/${u.project.id}/preview`)).data, new RegExp(s.image.id));
    sql(ctx.mock.stateDir, `UPDATE entitlements SET status = 'revoked' WHERE product_id = '${row.product_id}' AND user_id = '${u.user.id}'`);
    assert.ok(!new RegExp(s.image.id).test((await u.c.get(`/api/studio/projects/${u.project.id}/preview`)).data));
  });

  test("deleting a piece: used where installed, no longer counted against its creator; unused files go", async () => {
    const s = await creator("lib-del", { trusted: true });
    const id = (await s.c.post(`/api/studio/creators/${s.creator.id}/library`, shareBody(s))).data.piece.id;
    const u = await creator("lib-del-user");
    await u.c.post(`/api/studio/creators/${u.creator.id}/library/${id}/install`, {});
    const before = (await s.c.get(`/api/studio/creators/${s.creator.id}/site`)).data.storage.usedBytes;
    // Deleting the image while the piece shares it only hides it.
    assert.equal((await s.c.req("DELETE", `/api/studio/creators/${s.creator.id}/images/${s.image.id}`, { body: {} })).data.kept, true);
    assert.equal((await s.c.req("DELETE", `/api/studio/creators/${s.creator.id}/library/${id}`, { body: {} })).status, 200);
    assert.ok(!(await u.c.get(`/api/studio/library?creatorId=${u.creator.id}`)).data.pieces.some((p) => p.id === id), "no longer listed");
    assert.equal((await s.c.get(`/api/studio/creators/${s.creator.id}/site`)).data.storage.usedBytes, before, "still counted for its creator until the sweep deletes it");
    assert.ok(!(await s.c.get(`/api/studio/creators/${s.creator.id}/site`)).data.files.some((f) => f.id === s.image.id), "but no longer theirs to use");
    assert.equal((await new Client(base()).get(s.image.src)).status, 200, "still served for the site that installed it");
    assert.equal((await u.c.post(`/api/studio/creators/${u.creator.id}/library/${id}/install`, {})).status, 200, "who installed it can still use it");
    // Installing your own piece and deleting it frees nothing: only other creators' installs keep files.
    const self = await creator("lib-self", { trusted: true });
    const sid = (await self.c.post(`/api/studio/creators/${self.creator.id}/library`, shareBody(self))).data.piece.id;
    await self.c.post(`/api/studio/creators/${self.creator.id}/library/${sid}/install`, {});
    await self.c.req("DELETE", `/api/studio/creators/${self.creator.id}/images/${self.image.id}`, { body: {} });
    await self.c.req("DELETE", `/api/studio/creators/${self.creator.id}/library/${sid}`, { body: {} });
    assert.equal(sql(ctx.mock.stateDir, `SELECT released_at FROM site_assets WHERE id = '${self.image.id}'`)[0].released_at, null);
    // A piece nobody installed: its files go with it.
    const lone = await creator("lib-lone", { trusted: true });
    const lid = (await lone.c.post(`/api/studio/creators/${lone.creator.id}/library`, shareBody(lone))).data.piece.id;
    await lone.c.req("DELETE", `/api/studio/creators/${lone.creator.id}/images/${lone.image.id}`, { body: {} });
    await lone.c.req("DELETE", `/api/studio/creators/${lone.creator.id}/library/${lid}`, { body: {} });
    assert.equal((await new Client(base()).get(lone.image.src)).status, 404);
  });

  test("reports reach the Control Center; a takedown hides the piece and its files everywhere and takes it off sale", async () => {
    const s = await creator("lib-report", { trusted: true });
    const id = (await s.c.post(`/api/studio/creators/${s.creator.id}/library`, shareBody(s, { priceCents: 500, projectId: s.project.id }))).data.piece.id;
    const u = await creator("lib-reporter");
    assert.equal((await u.c.post(`/api/studio/library/${id}/report`, { reason: "x" })).status, 400);
    assert.equal((await u.c.post(`/api/studio/library/${id}/report`, { reason: "Copies someone else's design" })).status, 200);
    assert.equal((await u.c.get("/api/admin/library")).status, 404, "admins only");
    const admin = await adminClient(base());
    const listed = (await admin.get("/api/admin/library")).data.pieces.find((p) => p.id === id);
    assert.equal(listed.openReports, 1);
    assert.equal((await admin.req("PATCH", `/api/admin/library/${id}`, { body: { status: "removed", note: "copied" } })).status, 200);
    assert.ok(!(await u.c.get("/api/studio/library")).data.pieces.some((p) => p.id === id));
    assert.equal((await u.c.post(`/api/studio/creators/${u.creator.id}/library/${id}/install`, {})).status, 404);
    const productId = sql(ctx.mock.stateDir, `SELECT product_id FROM library_pieces WHERE id = '${id}'`)[0].product_id;
    assert.equal(sql(ctx.mock.stateDir, `SELECT published FROM products WHERE id = '${productId}'`)[0].published, 0);
    assert.equal(sql(ctx.mock.stateDir, `SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'library.removed' AND target_id = '${id}'`)[0].n, 1);
    assert.equal((await admin.req("PATCH", `/api/admin/library/${id}`, { body: { status: "active" } })).status, 200);
    assert.equal(sql(ctx.mock.stateDir, `SELECT published FROM products WHERE id = '${productId}'`)[0].published, 1);
    // Deleting a piece doesn't dodge a takedown: it is still listed for the admin and can be taken down, and its files
    // then stop showing on the sites that installed it.
    const d = await creator("lib-dodge", { trusted: true });
    const did = (await d.c.post(`/api/studio/creators/${d.creator.id}/library`, shareBody(d))).data.piece.id;
    const victim = await creator("lib-dodge-user");
    await victim.c.post(`/api/studio/creators/${victim.creator.id}/library/${did}/install`, {});
    await victim.c.req("PUT", `/api/studio/projects/${victim.project.id}/site`, { body: v2([img(d.image.id)]) });
    await d.c.req("DELETE", `/api/studio/creators/${d.creator.id}/library/${did}`, { body: {} });
    assert.match((await victim.c.get(`/api/studio/projects/${victim.project.id}/preview`)).data, new RegExp(d.image.id));
    assert.ok((await admin.get("/api/admin/library")).data.pieces.some((p) => p.id === did && p.status === "deleted"));
    assert.equal((await admin.req("PATCH", `/api/admin/library/${did}`, { body: { status: "removed", note: "abuse" } })).status, 200);
    assert.ok(!new RegExp(d.image.id).test((await victim.c.get(`/api/studio/projects/${victim.project.id}/preview`)).data));
    assert.equal((await admin.req("PATCH", `/api/admin/library/${did}`, { body: { status: "active" } })).status, 200);
    assert.equal(sql(ctx.mock.stateDir, `SELECT status FROM library_pieces WHERE id = '${did}'`)[0].status, "deleted", "a restore puts back what it was");
  });
});

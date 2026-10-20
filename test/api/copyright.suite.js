// Copyright notices and strikes (server/copyright/; docs/community-safety.md, docs/decisions.md 2026-10-20). Only
// admins record and decide notices; accepting gives the uploader a whole strike and the creator space half (whole
// when its owner uploaded it); two strikes stop an account publishing or pricing, and a space at two pauses its
// paid sales and free claims while what people already bought stays theirs; withdrawn and expired strikes stop
// counting; a hold keeps the top level; nothing is decided twice.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql, outbox, linkIn } from "../support/client.js";
import { SWEEP_TOKEN } from "./packs.suite.js";
import { newBuyer, mockBuy, freshAdmin } from "../support/flows.js";

const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export default (ctx) => describe("copyright strikes", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);

  async function space(tag) {
    const { c, user } = await newBuyer(base(), tag);
    const cr = await c.post("/api/studio/creators", { name: `Space ${tag}`, slug: slug(tag) });
    assert.equal(cr.status, 201, JSON.stringify(cr.data));
    const pr = await c.post(`/api/studio/creators/${cr.data.creator.id}/projects`, { name: "Beats", slug: "beats" });
    return { c, user, creator: cr.data.creator, project: pr.data.project };
  }
  async function member(s, tag) {
    const m = await newBuyer(base(), tag);
    assert.equal((await s.c.post(`/api/studio/creators/${s.creator.id}/invites`, { email: m.user.email, role: "admin" })).status, 201);
    const token = new URL(linkIn((await outbox(base(), m.user.email)).find((x) => x.kind === "creator-invite"))).hash.replace("#invite=", "");
    assert.equal((await m.c.post("/api/studio/invites/accept", { token })).status, 200);
    return m;
  }
  async function product(s, priceCents = 1500) {
    const r = await s.c.post(`/api/studio/projects/${s.project.id}/products`, { title: `Strike Pack ${slug("p")}`, type: "sample-pack", priceCents, description: "Drums.", includes: ["kicks"], tags: ["drums"] });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    db(`UPDATE products SET published = 1 WHERE id = '${r.data.product.id}'`);
    return r.data.product.id;
  }
  const notice = async (admin) => (await admin.post("/api/admin/copyright/notices", { claimantName: "Rights Holder Ltd", claimantEmail: "rights@example.com",
    work: "Our track Night Drive", location: "https://autostacc.com/shop/some-pack", statements: true })).data.id;
  const accept = (admin, id, creatorId, uploaderId) => admin.post(`/api/admin/copyright/notices/${id}`, { outcome: "accepted", creatorId, uploaderId });
  const units = (subject, id) => Number(db(`SELECT COALESCE(SUM(units), 0) AS n FROM copyright_strikes WHERE subject = '${subject}' AND subject_id = '${id}' AND state = 'active'`)[0].n);
  const price = (c, productId) => c.post("/api/cart/price", { items: [{ productId, quantity: 1 }] });

  test("only admins; a notice needs its statements; a decision happens once", async () => {
    const someone = (await newBuyer(base(), "cp-anyone")).c;
    assert.equal((await someone.get("/api/admin/copyright")).status, 404);
    assert.equal((await someone.post("/api/admin/copyright/notices", { claimantName: "X", claimantEmail: "x@example.com", work: "w", location: "l", statements: true })).status, 404);
    const admin = await freshAdmin(base());
    const bad = await admin.post("/api/admin/copyright/notices", { claimantName: "Rights Holder", claimantEmail: "rights@example.com", work: "A song", location: "somewhere" });
    assert.equal(bad.data.error.code, "statements_required");
    const id = await notice(admin);
    assert.equal((await admin.post(`/api/admin/copyright/notices/${id}`, { outcome: "rejected" })).data.error.code, "note_required");
    assert.equal((await admin.post(`/api/admin/copyright/notices/${id}`, { outcome: "rejected", note: "Not a valid notice" })).status, 200);
    const s = await space("cp-once");
    assert.equal((await accept(admin, id, s.creator.id)).data.error.code, "changed");
    assert.equal(units("creator", s.creator.id), 0);
    assert.equal(Number(db(`SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'copyright.notice_rejected' AND target_id = '${id}'`)[0].n), 1);
  });

  test("a member's strike is whole for them and half for the space; the owner's own upload is whole for the space", async () => {
    const s = await space("cp-weights");
    const m = await member(s, "cp-member");
    const outsider = await newBuyer(base(), "cp-outsider");
    const admin = await freshAdmin(base());
    assert.equal((await accept(admin, await notice(admin), s.creator.id, "no-such-account-1")).data.error.code, "no_account");
    assert.equal((await accept(admin, await notice(admin), s.creator.id, m.user.id)).status, 200);
    assert.equal(units("account", m.user.id), 2);
    assert.equal(units("creator", s.creator.id), 1);
    assert.equal(units("account", s.user.id), 0, "the owner's account is untouched");
    await accept(admin, await notice(admin), s.creator.id, s.user.id);
    assert.equal(units("creator", s.creator.id), 3);
    assert.equal(units("account", s.user.id), 2);
    // Someone no longer on the team (left before the decision) still gets the strike, and the space half (security review).
    assert.equal((await accept(admin, await notice(admin), s.creator.id, outsider.user.id)).status, 200);
    assert.equal(units("account", outsider.user.id), 2);
    assert.equal(units("creator", s.creator.id), 4);
  });

  test("two strikes: the account can't publish or price; the space's sales and free claims pause, purchases stay", async () => {
    const s = await space("cp-pause");
    const m = await member(s, "cp-pricer");
    const paid = await product(s);
    const free = await product(s, 0);
    const buyer = await newBuyer(base(), "cp-buyer");
    await mockBuy(buyer.c, [{ productId: paid, quantity: 1 }]);
    const admin = await freshAdmin(base());
    for (let i = 0; i < 2; i++) await accept(admin, await notice(admin), s.creator.id, m.user.id);
    // The member, at two strikes, can't price; the space (one strike: half plus half) still sells.
    assert.equal((await m.c.req("PATCH", `/api/studio/products/${paid}`, { body: { priceCents: 999 } })).data.error.code, "copyright_paused");
    assert.equal((await m.c.post(`/api/studio/products/${paid}/sales`, { percentOff: 10 })).data.error.code, "copyright_paused");
    assert.equal((await s.c.req("PATCH", `/api/studio/products/${paid}`, { body: { priceCents: 1600 } })).status, 200, "the owner still can");
    assert.equal((await price(new Client(base()), paid)).data.cart.held.length, 0);
    assert.equal((await m.c.req("PATCH", `/api/studio/products/${paid}`, { body: { salesPaused: false } })).data.error.code, "copyright_paused", "no resuming sales either");
    const up = await m.c.req("PUT", `/api/studio/products/${paid}/files?filename=more.zip`, { raw: Buffer.from("PK\u0003\u0004 more", "latin1"), headers: { "Content-Type": "application/octet-stream" } });
    assert.equal(up.data.error.code, "copyright_paused", "no new files on a product already on sale");
    // The owner's own upload: the space reaches two strikes.
    const owned = await accept(admin, await notice(admin), s.creator.id, s.user.id);
    assert.equal(owned.status, 200);
    const cart = (await price(new Client(base()), paid)).data.cart;
    assert.deepEqual(cart.held, [{ productId: paid, reason: "seller_paused" }], "a reason that doesn't say why");
    const shopper = await newBuyer(base(), "cp-shopper");
    assert.equal((await shopper.c.post("/api/checkout", { items: [{ productId: paid, quantity: 1 }] })).data.error.code, "seller_paused");
    assert.equal((await shopper.c.post("/api/library/free", { productId: free })).data.error.code, "seller_paused");
    const lib = (await buyer.c.get("/api/library")).data.items;
    assert.ok(lib.some((x) => x.productId === paid || (x.product && x.product.id === paid)), "the earlier purchase stays");
  });

  test("withdrawn and expired strikes stop counting; a hold keeps the top level until lifted", async () => {
    const s = await space("cp-ends");
    const paid = await product(s);
    const admin = await freshAdmin(base());
    const a = await notice(admin), b = await notice(admin);
    await accept(admin, a, s.creator.id);
    await accept(admin, b, s.creator.id);
    assert.equal((await price(new Client(base()), paid)).data.cart.held.length, 1, "two whole strikes (no member named)");
    assert.equal((await admin.post(`/api/admin/copyright/notices/${a}`, { outcome: "withdrawn", note: "Claimant withdrew" })).status, 200);
    assert.equal((await price(new Client(base()), paid)).data.cart.held.length, 0);
    await accept(admin, await notice(admin), s.creator.id);
    db(`UPDATE copyright_strikes SET expires_at = '2026-01-01T00:00:00.000Z' WHERE notice_id = '${b}'`);
    assert.equal((await price(new Client(base()), paid)).data.cart.held.length, 0, "the expired one no longer counts");
    assert.equal((await admin.req("PUT", "/api/admin/copyright/holds", { body: { subject: "creator", subjectId: s.creator.id, note: "Repeated serious infringement" } })).data.standing.level, 3);
    assert.equal((await price(new Client(base()), paid)).data.cart.held.length, 1);
    assert.equal((await admin.req("DELETE", "/api/admin/copyright/holds", { body: { subject: "creator", subjectId: s.creator.id } })).status, 200);
    assert.equal((await admin.req("DELETE", "/api/admin/copyright/holds", { body: { subject: "creator", subjectId: s.creator.id } })).status, 404);
    assert.equal((await price(new Client(base()), paid)).data.cart.held.length, 0);
  });

  test("the public form: what the law asks, the same answer whatever it names, a quiet trap for bots, and limits", async () => {
    const form = (c, o = {}) => c.post("/api/copyright/notices", { claimantName: "Ada Composer", claimantEmail: `ada-${slug("e")}@example.org`, claimantAddress: "1 Music Row, Nashville",
      role: "owner", work: "My track Night Drive (2024)", location: "https://autostacc.com/shop/some-pack", goodFaith: true, accurate: true, signature: "ada composer", ...o });
    const c = new Client(base());
    assert.equal((await form(c, { accurate: false })).data.error.code, "statements_required");
    assert.equal((await form(c, { signature: "Someone Else" })).data.error.code, "signature_mismatch");
    assert.equal((await form(c, { location: Array.from({ length: 21 }, (_, i) => `https://autostacc.com/p/${i}`).join("\n") })).data.error.code, "too_many_locations");
    assert.equal((await form(c, { role: "fan" })).status, 400);
    const c3 = new Client(base());
    assert.equal((await form(c3, { claimantName: "李明", signature: "--" })).data.error.code, "signature_mismatch", "an empty fold never matches");
    assert.equal((await form(c3, { claimantName: "李明", signature: "李明", work: "Non-Latin signature" })).status, 202);
    const c2 = new Client(base()); // five an hour per address counts refused tries too
    const sent = await form(c2, { work: "Quiet trap test", website: "http://spam.example" });
    assert.equal(sent.status, 202);
    assert.equal(db("SELECT COUNT(*) AS n FROM copyright_notices WHERE work = 'Quiet trap test'")[0].n, 0, "a filled-in hidden field is ignored");
    const ok = await form(c2, { work: "Real notice from the form" });
    assert.equal(ok.status, 202);
    assert.deepEqual(ok.data, sent.data, "the same answer either way");
    assert.deepEqual(db("SELECT source, status, claimant_role AS role FROM copyright_notices WHERE work = 'Real notice from the form'")[0], { source: "form", status: "received", role: "owner" });
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await form(c2, { work: `Burst ${i}` })).status);
    assert.equal(statuses.includes(429), true, statuses.join(","));
  });

  test("a takedown holds the file from everyone, tells the uploader; a counter-notice brings it back after 14 days unless the claimant sues", async () => {
    const s = await space("cp-takedown");
    const paid = await product(s);
    const fileId = `pf_${slug("f").replace(/[^a-z0-9]/g, "")}`;
    db(`INSERT INTO product_files (id, product_id, r2_key, filename, label, content_type, size_bytes, sort, active, created_at, kind, status, status_at)
      VALUES ('${fileId}', '${paid}', 'k/${fileId}', 'pack.zip', '', 'application/zip', 10, 0, 1, '2026-10-01T00:00:00.000Z', '', 'published', '2026-10-01T00:00:00.000Z')`);
    const buyer = await newBuyer(base(), "cp-tdbuyer");
    await mockBuy(buyer.c, [{ productId: paid, quantity: 1 }]);
    const files = async () => ((await buyer.c.get("/api/library")).data.items.find((x) => x.productId === paid) || { files: [] }).files.map((f) => f.id);
    assert.deepEqual(await files(), [fileId]);
    const admin = await freshAdmin(base());
    const id = await notice(admin);
    assert.equal((await admin.post(`/api/admin/copyright/notices/${id}`, { outcome: "accepted", creatorId: s.creator.id, uploaderId: s.user.id, targets: [{ kind: "product_file", id: "pf_nope" }] })).data.error.code, "no_target");
    const elsewhere = await space("cp-elsewhere");
    assert.equal((await admin.post(`/api/admin/copyright/notices/${id}`, { outcome: "accepted", creatorId: elsewhere.creator.id, targets: [{ kind: "product_file", id: fileId }] })).data.error.code, "target_other_creator", "a file of another creator space");
    assert.equal((await admin.post(`/api/admin/copyright/notices/${id}`, { outcome: "accepted", creatorId: s.creator.id, uploaderId: s.user.id, targets: [{ kind: "product_file", id: fileId }] })).status, 200);
    assert.deepEqual(await files(), [], "held from past buyers too");
    assert.ok(db(`SELECT held_at FROM product_files WHERE id = '${fileId}'`)[0].held_at);
    const mail = (await outbox(base(), s.user.email)).find((m) => m.kind === "copyright-takedown");
    assert.ok(mail, "the uploader is told");
    assert.doesNotMatch(mail.body_text, /rights@example\.com|Rights Holder/, "never the claimant's details");
    // Only the uploader can answer; once.
    const stranger = await newBuyer(base(), "cp-stranger");
    assert.equal((await stranger.c.get(`/api/copyright/notices/${id}/mine`)).status, 404);
    assert.equal((await s.c.get(`/api/copyright/notices/${id}/mine`)).data.notice.takenDown.length, 1);
    const counter = (o = {}) => s.c.post(`/api/copyright/notices/${id}/counter`, { name: "Sam Seller", email: "sam@example.org", address: "2 Beat Street, Leeds", mistake: true, jurisdiction: true, signature: "Sam Seller", ...o });
    assert.equal((await counter({ jurisdiction: false })).data.error.code, "statements_required");
    assert.equal((await counter({ signature: "Not Me" })).data.error.code, "signature_mismatch");
    assert.equal((await counter()).status, 201);
    assert.equal((await counter()).data.error.code, "already_sent");
    assert.ok((await outbox(base(), "rights@example.com")).some((m) => m.kind === "copyright-counter-notice" && /2 Beat Street/.test(m.body_text)), "the claimant gets the counter-notice");
    const sweep = async () => (await (await fetch(`${base()}/api/internal/sweep`, { method: "POST", headers: { Authorization: `Bearer ${SWEEP_TOKEN}` } })).json()).copyright;
    await sweep();
    assert.ok(db(`SELECT held_at FROM product_files WHERE id = '${fileId}'`)[0].held_at, "not before the 14 days");
    db(`UPDATE copyright_counter_notices SET restore_after = '2026-01-01T00:00:00.000Z' WHERE notice_id = '${id}'`);
    assert.ok((await sweep()).restored >= 1);
    assert.deepEqual(await files(), [fileId], "back for its buyers");
    assert.equal(units("account", s.user.id), 0, "the strike ended as countered");
    assert.equal(db(`SELECT status FROM copyright_counter_notices WHERE notice_id = '${id}'`)[0].status, "restored");
    // Another notice: the claimant goes to court, so it stays down.
    const id2 = await notice(admin);
    await admin.post(`/api/admin/copyright/notices/${id2}`, { outcome: "accepted", creatorId: s.creator.id, uploaderId: s.user.id, targets: [{ kind: "product_file", id: fileId }] });
    await s.c.post(`/api/copyright/notices/${id2}/counter`, { name: "Sam Seller", email: "sam@example.org", address: "2 Beat Street, Leeds", mistake: true, jurisdiction: true, signature: "Sam Seller" });
    assert.equal((await admin.post(`/api/admin/copyright/notices/${id2}`, { outcome: "sued", note: "Court filing received" })).status, 200);
    // While it's held, another notice can't name it (so one counter-notice never undoes another notice's hold).
    const id3 = await notice(admin);
    assert.equal((await admin.post(`/api/admin/copyright/notices/${id3}`, { outcome: "accepted", creatorId: s.creator.id, targets: [{ kind: "product_file", id: fileId }] })).data.error.code, "target_not_up");
    const other = await space("cp-other");
    assert.equal((await admin.post(`/api/admin/copyright/notices/${id3}`, { outcome: "accepted", creatorId: other.creator.id, targets: [{ kind: "product_file", id: "pf_zzzz" }] })).status, 404);
    db(`UPDATE copyright_counter_notices SET restore_after = '2026-01-01T00:00:00.000Z' WHERE notice_id = '${id2}'`);
    await sweep();
    assert.deepEqual(await files(), [], "stays down while it's in court");
    // Withdrawing the notice brings it back.
    assert.equal((await admin.post(`/api/admin/copyright/notices/${id2}`, { outcome: "withdrawn", note: "Claimant withdrew" })).status, 200);
    assert.deepEqual(await files(), [fileId]);
  });
});

// Product Studio (docs/studio.md): one product's workspace, readiness guarding publish, the release history, creators'
// own sales (one at a time, race-safe, never someone else's) with earnings estimates, and insights from real paid
// orders (with a CSV). Every route answers 404 to anyone who isn't the product's owner or a teammate who runs products, and they never
// see earnings figures.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql } from "../support/client.js";
import { newBuyer, mockBuy, adminClient, freshAdmin } from "../support/flows.js";

const ZIP = Buffer.from("PK\u0003\u0004 sample pack", "latin1");
const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const iso = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

export default (ctx) => describe("studio", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);

  async function seller(tag, { trusted = false } = {}) {
    const { c, user } = await newBuyer(base(), tag);
    const cr = await c.post("/api/studio/creators", { name: `Seller ${tag}`, slug: slug(tag) });
    assert.equal(cr.status, 201, JSON.stringify(cr.data));
    const pr = await c.post(`/api/studio/creators/${cr.data.creator.id}/projects`, { name: "Beats", slug: "beats" });
    assert.equal(pr.status, 201);
    if (trusted) db(`UPDATE creators SET trusted = 1, platform_fee_bps = 1000 WHERE id = '${cr.data.creator.id}'`);
    return { c, user, creator: cr.data.creator, project: pr.data.project };
  }
  const make = async (s, o = {}) => {
    const r = await s.c.post(`/api/studio/projects/${s.project.id}/products`, { title: "Dusty Drums", type: "sample-pack", priceCents: 2000, description: "Warm.", ...o });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.product;
  };
  const upload = (s, p, name = "pack.zip") => s.c.req("PUT", `/api/studio/products/${p.id}/files?filename=${name}`, { raw: ZIP, headers: { "Content-Type": "application/octet-stream" } });
  const patch = (client, p, body) => client.req("PATCH", `/api/studio/products/${p.id}`, { body });
  const onSale = async (s, o) => {
    const p = await make(s, o);
    assert.equal((await upload(s, p)).status, 201);
    assert.equal((await patch(s.c, p, { published: true })).status, 200);
    return p;
  };
  const kinds = async (s, p) => (await s.c.get(`/api/studio/products/${p.id}/activity`)).data.activity.map((e) => e.kind);
  // Another account on the creator's team who runs products but never sees money: a store manager (roles.js), made
  // directly in the database (invitations are tested in team.suite.js).
  async function editorOf(s, tag) {
    const e = await newBuyer(base(), tag);
    db(`INSERT INTO creator_members (creator_id, user_id, role, created_at) VALUES ('${s.creator.id}', '${e.user.id}', 'editor', '${iso(0)}');
      INSERT INTO creator_roles (creator_id, user_id, role, created_at, updated_at) VALUES ('${s.creator.id}', '${e.user.id}', 'store_manager', '${iso(0)}', '${iso(0)}')`);
    return e;
  }

  test("a project's card personality: presets only, its team only, and the browse answer carries it", async () => {
    const s = await seller("persona");
    const path = `/api/studio/projects/${s.project.id}/personality`;
    const start = await s.c.get(path);
    assert.equal(start.status, 200);
    assert.deepEqual([start.data.accent, start.data.motion], ["auto", "auto"]);
    assert.equal((await s.c.req("PUT", path, { body: { accent: "#ff0000", motion: "pulse" } })).status, 400);
    assert.equal((await s.c.req("PUT", path, { body: { accent: "violet", motion: "url(x)" } })).status, 400);
    const other = await seller("persona-other");
    assert.equal((await other.c.req("PUT", path, { body: { accent: "violet", motion: "wave" } })).status, 404);
    assert.equal((await new Client(base()).req("PUT", path, { body: { accent: "violet", motion: "wave" } })).status, 401);
    const ok = await s.c.req("PUT", path, { body: { accent: "violet", motion: "wave" } });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    db(`UPDATE projects SET published = 1 WHERE id = '${s.project.id}'`);
    const browse = await new Client(base()).get("/api/projects/browse?q=beats");
    const mine = (browse.data.projects || []).find((p) => p.id === s.project.id);
    if (mine) assert.deepEqual(mine.personality, { accent: "violet", motion: "wave" });
  });

  test("the spotlight: only admins pick, kinds belong to their page, picks are capped and audited, and pages read ids only", async () => {
    const admin = await freshAdmin(base());
    const s = await seller("spot");
    assert.equal((await s.c.post("/api/admin/spotlight", { page: "discover", kind: "project", refId: s.project.id })).status, 404);
    assert.equal((await admin.post("/api/admin/spotlight", { page: "discover", kind: "product", refId: "x" })).status, 400, "products belong to the store");
    assert.equal((await admin.post("/api/admin/spotlight", { page: "nowhere", kind: "project", refId: "x" })).status, 400);
    assert.equal((await admin.post("/api/admin/spotlight", { page: "discover", kind: "project", refId: "<b>x" })).status, 400);
    const add = await admin.post("/api/admin/spotlight", { page: "discover", kind: "project", refId: s.project.id });
    assert.equal(add.status, 201, JSON.stringify(add.data));
    assert.equal((await admin.post("/api/admin/spotlight", { page: "discover", kind: "project", refId: s.project.id })).status, 409);
    const pub = await new Client(base()).get("/api/spotlight?page=discover");
    assert.ok(pub.data.picks.some((p) => p.kind === "project" && p.id === s.project.id));
    assert.equal(db(`SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'spotlight.add' AND target_id = '${s.project.id}'`)[0].n, 1);
    assert.equal((await s.c.req("DELETE", `/api/admin/spotlight/${add.data.id}`)).status, 404);
    assert.equal((await admin.req("DELETE", `/api/admin/spotlight/${add.data.id}`)).status, 200);
  });

  test("a creator's short bio: plain text, trimmed to 160 characters, owner only", async () => {
    const s = await seller("bio");
    const path = `/api/studio/creators/${s.creator.id}`;
    const r = await s.c.req("PATCH", path, { body: { bio: `  Makes   dusty drums ${"x".repeat(300)}` } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const bio = db(`SELECT bio FROM creators WHERE id = '${s.creator.id}'`)[0].bio;
    assert.ok(bio.startsWith("Makes dusty drums"));
    assert.equal(bio.length, 160);
    const other = await seller("bio-other");
    assert.equal((await other.c.req("PATCH", path, { body: { bio: "mine now" } })).status, 404);
    assert.equal((await s.c.req("PATCH", path, { body: { bio: "" } })).status, 200);
    assert.equal(db(`SELECT bio FROM creators WHERE id = '${s.creator.id}'`)[0].bio, null);
  });

  test("a creator's avatar and banner: only their own uploaded images, cleared with an empty value, kept while used", async () => {
    const s = await seller("pics");
    const other = await seller("pics-other");
    const T = new Date().toISOString();
    const img = (id, creator, type = "image/png") => db(`INSERT INTO site_assets (id, creator_id, r2_key, filename, content_type, size_bytes, status, created_by, created_at)
      VALUES ('${id}', '${creator}', 'sites/${id}', 'a.png', '${type}', 10, 'active', '${s.user.id}', '${T}')`);
    // Image ids look like the store's own (as_ + base32).
    const aid = () => `as_${Array.from({ length: 24 }, () => "abcdefghijklmnopqrstuvwxyz234567"[Math.floor(Math.random() * 32)]).join("")}`;
    const mine = aid(), theirs = aid(), font = aid();
    img(mine, s.creator.id); img(theirs, other.creator.id); img(font, s.creator.id, "font/woff2");
    const path = `/api/studio/creators/${s.creator.id}`;
    assert.equal((await s.c.req("PATCH", path, { body: { avatarId: theirs } })).status, 400, "not someone else's image");
    assert.equal((await s.c.req("PATCH", path, { body: { bannerId: font } })).status, 400, "not a font");
    assert.equal((await s.c.req("PATCH", path, { body: { avatarId: "missing" } })).status, 400);
    assert.equal((await s.c.req("PATCH", path, { body: { avatarId: mine, bannerId: mine } })).status, 200);
    assert.deepEqual(db(`SELECT avatar_asset, banner_asset FROM creators WHERE id = '${s.creator.id}'`)[0], { avatar_asset: mine, banner_asset: mine });
    assert.equal((await s.c.req("DELETE", `/api/studio/creators/${s.creator.id}/images/${mine}`)).status, 200);
    assert.equal(db(`SELECT status FROM site_assets WHERE id = '${mine}'`)[0].status, "active", "still the avatar: hidden, not removed");
    assert.equal((await s.c.req("PATCH", path, { body: { avatarId: "", bannerId: "" } })).status, 200);
    assert.deepEqual(db(`SELECT avatar_asset, banner_asset FROM creators WHERE id = '${s.creator.id}'`)[0], { avatar_asset: null, banner_asset: null });
  });

  test("nobody but the product's owner or editor reaches any Product Studio route", async () => {
    const s = await seller("ps-owner", { trusted: true });
    const t = await seller("ps-thief", { trusted: true });
    const p = await onSale(s);
    const sale = await s.c.post(`/api/studio/products/${p.id}/sales`, { percentOff: 10 });
    assert.equal(sale.status, 201, JSON.stringify(sale.data));
    const routes = [["GET", ""], ["GET", "/activity"], ["GET", "/pricing"], ["GET", "/insights"], ["GET", "/insights?format=csv"],
      ["POST", "/sales", { percentOff: 20 }], ["DELETE", `/sales/${sale.data.sale.id}`]];
    for (const [method, tail, body] of routes) {
      assert.equal((await t.c.req(method, `/api/studio/products/${p.id}${tail}`, { body })).status, 404, `${method} ${tail} (another creator)`);
      assert.equal((await new Client(base()).req(method, `/api/studio/products/${p.id}${tail}`, { body })).status, 401, `${method} ${tail} (signed out)`);
      assert.equal((await s.c.req(method, `/api/studio/products/no-such-product${tail}`, { body })).status, 404, `${method} ${tail} (no such product)`);
    }
    // A catalog product (not a Studio one) is never reachable either.
    assert.equal((await s.c.get("/api/studio/products/vj-loops")).status, 404);
    assert.equal(db(`SELECT ends_at FROM promotions WHERE id = '${sale.data.sale.id}'`)[0].ends_at, null, "the thief didn't end the sale");
  });

  test("the workspace: product, project, creator, readiness, history and a 30-day summary", async () => {
    const s = await seller("ps-ws");
    const p = await make(s);
    const ws = await s.c.get(`/api/studio/products/${p.id}`);
    assert.equal(ws.status, 200, JSON.stringify(ws.data));
    const w = ws.data;
    assert.equal(w.product.id, p.id);
    assert.deepEqual(w.project, { id: s.project.id, name: "Beats", slug: "beats", path: `/${s.creator.slug}/beats` });
    assert.deepEqual(w.creator, { id: s.creator.id, name: s.creator.name, slug: s.creator.slug, trusted: false, status: "active", firstParty: false });
    assert.equal(w.role, "owner");
    assert.equal(w.readiness.ready, false);
    assert.deepEqual(w.readiness.blocking.map((b) => [b.code, b.section]), [["needs_file", "pacs"]]);
    assert.deepEqual(w.readiness.recommended.map((b) => b.code), ["short_description", "no_artwork", "no_preview", "no_tags", "no_store_details", "no_includes"]);
    assert.deepEqual(w.activity.map((e) => e.kind), ["created"]);
    assert.equal(w.activity[0].actorId, s.user.id);
    assert.deepEqual(w.summary, { days: 30, orders: 0, units: 0, netCents: 0, creatorShareCents: 0, downloads: 0, views: 0 });
    assert.equal(w.limits.minPriceCents, 100);
    assert.equal(typeof w.features.packsStudio, "boolean");
    // A store manager sees the same product but not the creator's share.
    const e = await editorOf(s, "ps-ws-editor");
    const ew = (await e.c.get(`/api/studio/products/${p.id}`)).data;
    assert.equal(ew.role, "store_manager");
    assert.equal(ew.summary.creatorShareCents, null);
  });

  test("publishing is guarded by readiness: 409 with the blocking list, and the history records every change", async () => {
    const s = await seller("ps-release");
    const p = await make(s);
    const noFile = await patch(s.c, p, { published: true });
    assert.equal(noFile.status, 409);
    assert.equal(noFile.data.error.code, "needs_file");
    assert.deepEqual(noFile.data.error.blocking.map((b) => b.code), ["needs_file"]);
    // A price outside the range (left from an older rule) blocks too, with both reasons.
    db(`UPDATE products SET price_cents = 50 WHERE id = '${p.id}'`);
    const two = await patch(s.c, p, { published: true });
    assert.equal(two.status, 409);
    assert.equal(two.data.error.code, "not_ready");
    assert.deepEqual(two.data.error.blocking.map((b) => b.code), ["needs_file", "price_out_of_range"]);
    // Fixing the price in the same request as publishing counts; the file still blocks.
    assert.equal((await patch(s.c, p, { published: true, priceCents: 1500 })).data.error.code, "needs_file");
    assert.equal(db(`SELECT published, price_cents FROM products WHERE id = '${p.id}'`)[0].published, 0);
    assert.equal((await patch(s.c, p, { priceCents: 1500 })).status, 200);

    const file = await upload(s, p);
    assert.equal(file.data.file.status, "pending");
    assert.equal((await patch(s.c, p, { published: true })).data.error.code, "needs_file", "a file waiting for approval isn't deliverable");
    const admin = await adminClient(base());
    assert.equal((await admin.req("PATCH", `/api/admin/files/${file.data.file.id}`, { body: { status: "published" } })).status, 200);
    assert.equal((await patch(s.c, p, { published: true })).status, 200);
    assert.equal((await s.c.get(`/api/studio/products/${p.id}`)).data.readiness.ready, true);

    // Autosave: several edits by the same person a moment apart are one "edited" event naming every field.
    assert.equal((await patch(s.c, p, { title: "Dusty Drums II" })).status, 200);
    assert.equal((await patch(s.c, p, { description: "Warm, dusty one-shots from old records.", tags: ["drums"] })).status, 200);
    assert.equal((await patch(s.c, p, { title: "Dusty Drums II" })).status, 200, "saving the same value again");
    assert.equal((await patch(s.c, p, { salesPaused: true })).status, 200);
    assert.equal((await patch(s.c, p, { salesPaused: false })).status, 200);
    assert.equal((await patch(s.c, p, { published: false })).status, 200);
    assert.equal((await patch(s.c, p, { deleted: true })).status, 200);
    assert.equal((await patch(s.c, p, { deleted: false })).status, 200);
    assert.equal((await s.c.req("DELETE", `/api/studio/products/${p.id}/files/${file.data.file.id}`)).status, 200);
    const history = (await s.c.get(`/api/studio/products/${p.id}/activity?limit=50`)).data.activity;
    assert.deepEqual(history.map((e) => e.kind).reverse(),
      ["created", "price_changed", "file_added", "published", "edited", "paused", "resumed", "unpublished", "removed", "restored", "file_removed"]);
    const edited = history.find((e) => e.kind === "edited");
    assert.deepEqual(edited.detail.fields.sort(), ["description", "tags", "title"]);
    assert.deepEqual(history.find((e) => e.kind === "price_changed").detail, { from: 50, to: 1500 }, "the stored price it had");
    assert.deepEqual(history.find((e) => e.kind === "file_added").detail, { filename: file.data.file.filename });
    assert.ok(history.every((e) => e.actorId === s.user.id));
    assert.equal((await s.c.get(`/api/studio/products/${p.id}/activity?limit=2`)).data.activity.length, 2);
    assert.ok(!JSON.stringify(history).includes(s.user.email), "no emails in the history");
  });

  test("a deleted account's product events stay but forget who made them", async () => {
    const s = await seller("ps-forget");
    const p = await make(s);
    const e = await editorOf(s, "ps-forget-editor");
    assert.equal((await patch(e.c, p, { title: "Edited by the editor" })).status, 200);
    assert.equal(db(`SELECT COUNT(*) AS n FROM product_events WHERE actor_user_id = '${e.user.id}'`)[0].n, 1);
    const del = await e.c.post("/api/account/delete", { confirm: e.user.email, password: "correct-horse-battery" });
    assert.equal(del.status, 200, JSON.stringify(del.data));
    assert.equal(db(`SELECT COUNT(*) AS n FROM product_events WHERE actor_user_id = '${e.user.id}'`)[0].n, 0);
    assert.equal(db(`SELECT COUNT(*) AS n FROM product_events WHERE product_id = '${p.id}' AND kind = 'edited' AND actor_user_id IS NULL`)[0].n, 1);
  });

  test("creator sales: checked terms, one at a time, never edited, estimates from the server's split", async () => {
    const s = await seller("ps-sales", { trusted: true });
    const p = await onSale(s);
    const free = await onSale(s, { title: "Free Kit", priceCents: 0 });
    const post = (body, id = p.id) => s.c.post(`/api/studio/products/${id}/sales`, body);

    const f = await post({ percentOff: 10 }, free.id);
    assert.equal(f.status, 400);
    assert.equal(f.data.error.code, "free_product");
    for (const bad of [{}, { percentOff: 10, amountOffCents: 100 }, { percentOff: 0 }, { percentOff: 91 }, { percentOff: "50" }, { amountOffCents: 2000 }, { amountOffCents: 5000 },
      { percentOff: 10, startsAt: iso(-60) }, { percentOff: 10, startsAt: iso(60), endsAt: iso(30) }, { percentOff: 10, endsAt: iso(91 * 1440) },
      { percentOff: 10, startsAt: "next friday" }]) {
      assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal(db(`SELECT COUNT(*) AS n FROM promotions WHERE creator_id = '${s.creator.id}'`)[0].n, 0, "nothing was written");

    const ok = await post({ percentOff: 25, endsAt: iso(7 * 1440) });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal(ok.data.sale.status, "running");
    assert.equal(ok.data.sale.salePriceCents, 1500);
    assert.deepEqual(db(`SELECT kind, scope, scope_ids, creator_id, percent_off FROM promotions WHERE id = '${ok.data.sale.id}'`),
      [{ kind: "sale", scope: "products", scope_ids: JSON.stringify([p.id]), creator_id: s.creator.id, percent_off: 25 }]);
    const dup = await post({ amountOffCents: 100, startsAt: iso(30 * 1440) });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.error.code, "sale_exists", "a scheduled one can't be added while one is running");

    // The store's price is the sale price, and the estimate splits both prices with this creator's fee (10%).
    assert.equal((await new Client(base()).get(`/api/products/${p.id}`)).data.product.priceCents < 2000, true);
    const pr = (await s.c.get(`/api/studio/products/${p.id}/pricing`)).data;
    assert.equal(pr.priceCents, 2000);
    assert.equal(pr.feeBps, 1000);
    assert.equal(pr.effectivePriceCents, 1500);
    assert.deepEqual(pr.estimate.list, { priceCents: 2000, netCents: 2000, platformFeeCents: 200, creatorShareCents: 1800 });
    assert.deepEqual(pr.estimate.sale, { priceCents: 1500, netCents: 1500, platformFeeCents: 150, creatorShareCents: 1350 });
    assert.equal(pr.storeSale, null);
    assert.equal(pr.sales.length, 1);
    const e = await editorOf(s, "ps-sales-editor");
    const ep = (await e.c.get(`/api/studio/products/${p.id}/pricing`)).data;
    assert.equal(ep.feeBps, null);
    assert.equal(ep.estimate.list.creatorShareCents, null);
    assert.equal(ep.estimate.sale.platformFeeCents, null);

    // A lower AutoStacc sale wins, and the section says so.
    const admin = await adminClient(base());
    const store = await admin.post("/api/admin/promotions", { kind: "sale", name: "Store week", percentOff: 50, scope: "products", scopeIds: [p.id] });
    assert.equal(store.status, 201);
    const withStore = (await s.c.get(`/api/studio/products/${p.id}/pricing`)).data;
    assert.equal(withStore.storeSale.priceCents, 1000);
    assert.equal(withStore.effectivePriceCents, 1000);
    assert.equal(withStore.sales.length, 1, "AutoStacc's sale isn't listed as the creator's");
    // ...but the creator can never end it through the Studio, through this product or any other.
    assert.equal((await s.c.req("DELETE", `/api/studio/products/${p.id}/sales/${store.data.id}`)).status, 404);
    assert.equal((await admin.post(`/api/admin/promotions/${store.data.id}/end`, {})).status, 200);

    // Ending: a running sale ends now (the row stays for orders); someone else's sale id answers 404.
    const t = await seller("ps-sales-other", { trusted: true });
    const tp = await onSale(t);
    const theirs = await t.c.post(`/api/studio/products/${tp.id}/sales`, { percentOff: 30 });
    assert.equal(theirs.status, 201);
    assert.equal((await s.c.req("DELETE", `/api/studio/products/${p.id}/sales/${theirs.data.sale.id}`)).status, 404, "another creator's sale through my product");
    assert.equal((await s.c.req("DELETE", `/api/studio/products/${free.id}/sales/${ok.data.sale.id}`)).status, 404, "my sale through my other product");
    assert.equal((await s.c.req("DELETE", `/api/studio/products/${p.id}/sales/not-an-id`)).status, 404);
    assert.equal(db(`SELECT ends_at FROM promotions WHERE id = '${theirs.data.sale.id}'`)[0].ends_at, null);
    const end = await s.c.req("DELETE", `/api/studio/products/${p.id}/sales/${ok.data.sale.id}`);
    assert.equal(end.status, 200);
    assert.equal(end.data.status, "ended");
    assert.ok(db(`SELECT ends_at FROM promotions WHERE id = '${ok.data.sale.id}'`)[0].ends_at <= new Date().toISOString());
    assert.equal((await s.c.req("DELETE", `/api/studio/products/${p.id}/sales/${ok.data.sale.id}`)).status, 200, "ending twice is harmless");

    // A scheduled sale is deleted outright when ended before it starts.
    const later = await post({ amountOffCents: 500, startsAt: iso(2 * 1440), endsAt: iso(3 * 1440) });
    assert.equal(later.status, 201, JSON.stringify(later.data));
    assert.equal(later.data.sale.status, "scheduled");
    assert.deepEqual(later.data.pricing.estimate.sale, { priceCents: 1500, netCents: 1500, platformFeeCents: 150, creatorShareCents: 1350 });
    const gone = await s.c.req("DELETE", `/api/studio/products/${p.id}/sales/${later.data.sale.id}`);
    assert.equal(gone.data.status, "deleted");
    assert.equal(db(`SELECT COUNT(*) AS n FROM promotions WHERE id = '${later.data.sale.id}'`)[0].n, 0);
    assert.deepEqual((await kinds(s, p)).filter((k) => k.startsWith("sale_")), ["sale_ended", "sale_created", "sale_ended", "sale_created"]);
  });

  test("parallel sale requests make exactly one sale", async () => {
    const s = await seller("ps-race", { trusted: true });
    const p = await onSale(s);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => s.c.post(`/api/studio/products/${p.id}/sales`, { percentOff: 10 + i })));
    assert.equal(results.filter((r) => r.status === 201).length, 1, results.map((r) => r.status).join(","));
    assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409 && r.data.error.code === "sale_exists"));
    assert.equal(db(`SELECT COUNT(*) AS n FROM promotions WHERE creator_id = '${s.creator.id}'`)[0].n, 1);
  });

  test("insights count this store's paid orders, with earnings for the owner only, and export CSV", async () => {
    const s = await seller("ps-insights", { trusted: true });
    const p = await onSale(s);
    const sale = await s.c.post(`/api/studio/products/${p.id}/sales`, { percentOff: 25 });
    assert.equal(sale.status, 201);
    const { c: buyer } = await newBuyer(base(), "ps-insights-buyer");
    const order = await mockBuy(buyer, [{ productId: p.id }]);
    assert.equal(order.pay.status, 200, JSON.stringify(order.pay.data));
    // A checkout that was never paid doesn't count.
    const { c: other } = await newBuyer(base(), "ps-insights-unpaid");
    assert.equal((await other.post("/api/checkout", { items: [{ productId: p.id }] })).status, 201);
    assert.equal((await new Client(base()).post("/api/events", { event: "product_view", subject: p.id })).status, 202);
    assert.equal((await new Client(base()).post("/api/events", { event: "product_view", subject: p.id })).status, 202);

    const r = await s.c.get(`/api/studio/products/${p.id}/insights?days=30`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const t = r.data.totals;
    assert.deepEqual([t.orders, t.units, t.grossCents, t.discountCents, t.netCents, t.platformFeeCents, t.creatorShareCents, t.refundsCents, t.views],
      [1, 1, 2000, 500, 1500, 150, 1350, 0, 2]);
    assert.equal(t.conversion, 0.5);
    assert.equal(r.data.previous.orders, 0);
    assert.equal(r.data.daily.length, 30);
    assert.equal(r.data.daily.reduce((n, d) => n + d.netCents, 0), 1500);
    assert.equal(r.data.daily.at(-1).day, new Date().toISOString().slice(0, 10));
    assert.deepEqual(r.data.tracked, { views: true, traffic: false });
    assert.deepEqual(r.data.sales.map((x) => [x.saleId, x.orders, x.discountCents, x.creator]), [[sale.data.sale.id, 1, 500, true]]);
    assert.equal((await s.c.get(`/api/studio/products/${p.id}/insights?days=365`)).data.daily.length, 365);
    for (const bad of ["7", "abc", "-30", "30.5"]) assert.equal((await s.c.get(`/api/studio/products/${p.id}/insights?days=${bad}`)).status, 400, bad);
    assert.equal((await s.c.get(`/api/studio/products/${p.id}/insights?format=xml`)).status, 400);
    const ws = (await s.c.get(`/api/studio/products/${p.id}`)).data.summary;
    assert.deepEqual([ws.orders, ws.units, ws.netCents, ws.creatorShareCents, ws.views], [1, 1, 1500, 1350, 2]);

    // A partial refund takes its proportion off the creator's share.
    db(`UPDATE orders SET refunded_cents = 750 WHERE id = '${order.orderId}'`);
    const refunded = (await s.c.get(`/api/studio/products/${p.id}/insights`)).data.totals;
    assert.deepEqual([refunded.refundsCents, refunded.creatorShareCents], [750, 675]);
    db(`UPDATE orders SET refunded_cents = 0 WHERE id = '${order.orderId}'`);

    // Editors see orders, not earnings.
    const e = await editorOf(s, "ps-insights-editor");
    const ei = (await e.c.get(`/api/studio/products/${p.id}/insights`)).data;
    assert.equal(ei.totals.orders, 1);
    assert.equal(ei.totals.creatorShareCents, null);
    assert.equal(ei.totals.platformFeeCents, null);
    assert.ok(ei.daily.every((d) => d.creatorShareCents === null && d.platformFeeCents === null));
    assert.equal(ei.previous.creatorShareCents, null);

    // CSV: the daily rows, as a download.
    const csv = await s.c.get(`/api/studio/products/${p.id}/insights?days=30&format=csv`);
    assert.equal(csv.status, 200);
    assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
    assert.equal(csv.headers.get("content-disposition"), `attachment; filename="${p.id}-insights-30d.csv"`);
    const rows = csv.data.trim().split("\r\n");
    assert.equal(rows[0], "day,orders,units,grossCents,discountCents,netCents,platformFeeCents,creatorShareCents,refundsCents,freeClaims,downloads,views");
    assert.equal(rows.length, 31);
    assert.ok(rows.slice(1).some((l) => l.includes(",1,1,2000,500,1500,150,1350,0,")));
    const ecsv = (await e.c.get(`/api/studio/products/${p.id}/insights?format=csv`)).data.trim().split("\r\n");
    assert.ok(ecsv.slice(1).some((l) => l.includes(",1,1,2000,500,1500,,,0,")), "an editor's CSV has no earnings either");

    // Orders of the other mode (live money in a test store) never count.
    db(`UPDATE orders SET livemode = 1 WHERE id = '${order.orderId}'`);
    assert.equal((await s.c.get(`/api/studio/products/${p.id}/insights`)).data.totals.orders, 0);
    db(`UPDATE orders SET livemode = 0 WHERE id = '${order.orderId}'`);
  });

  test("an impersonating admin can look but can't create or end sales", async () => {
    const s = await seller("ps-imp", { trusted: true });
    const p = await onSale(s);
    const sale = await s.c.post(`/api/studio/products/${p.id}/sales`, { percentOff: 10 });
    const admin = await freshAdmin(base());
    assert.equal((await admin.post(`/api/admin/customers/${s.user.id}/impersonate`, { note: "studio check" })).status, 201);
    assert.equal((await admin.get(`/api/studio/products/${p.id}/pricing`)).status, 200);
    assert.equal((await admin.post(`/api/studio/products/${p.id}/sales`, { percentOff: 20 })).status, 403);
    assert.equal((await admin.req("DELETE", `/api/studio/products/${p.id}/sales/${sale.data.sale.id}`)).status, 403);
    assert.equal((await admin.req("PATCH", `/api/studio/products/${p.id}`, { body: { published: false } })).status, 403);
    assert.equal(db(`SELECT ends_at FROM promotions WHERE id = '${sale.data.sale.id}'`)[0].ends_at, null);
    assert.equal((await admin.post("/api/impersonation/exit", {})).status, 200);
  });

  test("the owner's creator purchases switch: open payment pages closed, held in the cart, refused at checkout, the rest still sells", async () => {
    const s = await seller("ps-switch", { trusted: true });
    const p = await onSale(s);
    const admin = await freshAdmin(base());
    // Only admins see or flip it.
    assert.equal((await s.c.get("/api/admin/creator-sales")).status, 404);
    assert.equal((await s.c.req("PUT", "/api/admin/creator-sales", { body: { open: false } })).status, 404);
    assert.equal((await admin.req("PUT", "/api/admin/creator-sales", { body: { open: "no" } })).status, 400);
    const open = await admin.get("/api/admin/creator-sales");
    assert.deepEqual(open.data.creatorSales, { open: true, keyReady: true, paused: false, reason: null }, "the mock store needs no marketplace key");
    // A payment page opened before the pause is closed by it, so it can't be paid afterwards.
    const { c: early } = await newBuyer(base(), "ps-switch-early");
    const opened = await early.post("/api/checkout", { items: [{ productId: p.id }] });
    assert.equal(opened.status, 201, JSON.stringify(opened.data));
    try {
      const paused = await admin.req("PUT", "/api/admin/creator-sales", { body: { open: false } });
      assert.equal(paused.status, 200);
      assert.equal(paused.data.creatorSales.reason, "paused");
      assert.ok(paused.data.closedCheckouts >= 1, "the open payment page was closed");
      assert.equal(db(`SELECT status FROM orders WHERE id = '${opened.data.orderId}'`)[0].status, "cancelled");
      assert.deepEqual((await s.c.get(`/api/studio/products/${p.id}`)).data.checkout, { open: false, reason: "paused" }, "the creator sees checkout is closed");
      assert.equal(db("SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'settings.creator_sales_paused'")[0].n >= 1, true);

      const { c: buyer } = await newBuyer(base(), "ps-switch-buyer");
      const items = [{ productId: p.id }, { productId: "stems-patchwork" }];
      const cart = await buyer.post("/api/cart/price", { items });
      assert.equal(cart.status, 200);
      assert.deepEqual(cart.data.cart.held, [{ productId: p.id, reason: "paused" }]);
      assert.deepEqual(cart.data.cart.problems, [], "held isn't a problem: it stays in the cart");
      assert.deepEqual(cart.data.creatorSales, { open: false, reason: "paused" });
      const own = cart.data.cart.lines.find((l) => l.productId === "stems-patchwork");
      assert.equal(cart.data.cart.subtotalCents, own.lineTotalCents, "held lines are outside the totals");

      const refused = await buyer.post("/api/checkout", { items });
      assert.equal(refused.status, 503);
      assert.equal(refused.data.error.code, "creator_sales_closed");
      assert.equal((await buyer.post("/api/checkout", { items: [{ productId: p.id }] })).status, 503);
      assert.equal(db(`SELECT COUNT(*) AS n FROM order_items WHERE product_id = '${p.id}' AND order_id <> '${opened.data.orderId}'`)[0].n, 0, "no order line for a held product");
      const rest = await mockBuy(buyer, [{ productId: "stems-patchwork" }]);
      assert.equal(rest.pay.status, 200, "AutoStacc's own items still sell");
    } finally {
      assert.equal((await admin.req("PUT", "/api/admin/creator-sales", { body: { open: true } })).status, 200);
    }
    const { c: later } = await newBuyer(base(), "ps-switch-later");
    assert.equal((await mockBuy(later, [{ productId: p.id }])).pay.status, 200, "reopened: creators' products sell again");
  });
});

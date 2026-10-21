// Admin: only the configured owner gets in; grants and revokes work and are separate records; uploads stay private;
// moderation (pause, hide, remove) works on any product but price and text stay the creator's; release artwork moves
// from the site's files into storage once (#179).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, unique, sql } from "../support/client.js";
import { newBuyer, adminClient, freshAdmin, mockBuy } from "../support/flows.js";

export default (ctx) => describe("admin", () => {
  test("customers get 404 on every admin route", async () => {
    const { c } = await newBuyer(ctx.mock.url, "not-admin");
    for (const [m, p] of [["GET", "/api/admin/summary"], ["GET", "/api/admin/products"], ["PATCH", "/api/admin/products/wallpapers"],
      ["PUT", "/api/admin/products/wallpapers/files?filename=x.zip"], ["DELETE", "/api/admin/files/pf_x"], ["GET", "/api/admin/orders"],
      ["POST", "/api/admin/entitlements"], ["GET", "/api/admin/customers"], ["GET", "/api/admin/pacs"],
      ["GET", "/api/admin/content/artwork"], ["POST", "/api/admin/content/artwork/move"]]) {
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

    const upload = await admin.req("PUT", "/api/admin/products/vj-loops/files?filename=loops.zip&label=Loops", { raw: Buffer.from("PK\u0003\u0004 fake zip bytes", "latin1"), headers: { "Content-Type": "application/zip" } });
    assert.equal(upload.status, 201);
    const products = (await admin.get("/api/admin/products")).data.products;
    assert.ok(products.find((p) => p.id === "vj-loops").files.some((f) => f.id === upload.data.fileId));
    // Not reachable without owning the product.
    assert.equal((await c.post("/api/downloads", { fileId: upload.data.fileId })).status, 403);
  });

  test("uploads: only the listed file types, whose bytes match their name; the stored type is ours, not the uploader's", async () => {
    const admin = await adminClient(ctx.mock.url);
    const put = (name, raw, type = "application/octet-stream", path = "files") =>
      admin.req("PUT", `/api/admin/${path === "files" ? "products/vj-loops/files" : "previews"}?filename=${encodeURIComponent(name)}`, { raw, headers: { "Content-Type": type } });
    const ZIP = Buffer.from("PK\u0003\u0004 ok", "latin1");
    const WAV = Buffer.from("RIFF\u0000\u0000\u0000\u0000WAVEfmt ", "latin1");
    const HTML = "<html><script>alert(1)</script></html>";

    // Not on the list, whatever the body or header claims.
    for (const name of ["evil.exe", "page.html", "image.svg", "run.js", "tool.sh", "macro.docm", "app.apk", "x.php", "noextension", "double.zip.exe", ".zip"]) {
      const r = await put(name, ZIP, "application/zip");
      assert.equal(r.status, 415, name);
      assert.equal(r.data.error.code, "unsupported_file_type", name);
    }
    // On the list, but the bytes are something else: nothing is kept.
    const before = sql(ctx.mock.stateDir, "SELECT COUNT(*) AS n FROM product_files WHERE product_id = 'vj-loops'")[0].n;
    for (const [name, body] of [["loops.zip", HTML], ["kick.wav", HTML], ["pic.png", ZIP], ["song.mp3", HTML], ["doc.pdf", ZIP], ["a.txt", Buffer.from([0x4d, 0x5a, 0, 0, 0x90, 0])], ["x.mid", WAV]]) {
      const r = await put(name, body, "application/zip");
      assert.equal(r.status, 415, name);
      assert.equal(r.data.error.code, "content_mismatch", name);
    }
    assert.equal(sql(ctx.mock.stateDir, "SELECT COUNT(*) AS n FROM product_files WHERE product_id = 'vj-loops'")[0].n, before, "no row for a rejected file");
    // A real file is stored with the type from its name even if the uploader says it is a web page.
    const ok = await put("real.zip", ZIP, "text/html");
    assert.equal(ok.status, 201);
    assert.equal(sql(ctx.mock.stateDir, `SELECT content_type FROM product_files WHERE id = '${ok.data.fileId}'`)[0].content_type, "application/zip");
    const wav = await put("kick.wav", WAV, "text/html");
    assert.equal(wav.status, 201);
    assert.equal(sql(ctx.mock.stateDir, `SELECT content_type FROM product_files WHERE id = '${wav.data.fileId}'`)[0].content_type, "audio/wav");
    // A preset format with no signature is allowed by name alone and downloads as an opaque attachment.
    const preset = await put("lead.fxp", Buffer.from("CcnK anything"), "text/html");
    assert.equal(preset.status, 201);
    assert.equal(sql(ctx.mock.stateDir, `SELECT content_type FROM product_files WHERE id = '${preset.data.fileId}'`)[0].content_type, "application/octet-stream");

    // Previews are public, so audio only.
    for (const name of ["clip.html", "clip.svg", "clip.zip", "clip.png", "clip.exe"]) {
      assert.ok([400, 415].includes((await put(name, WAV, "audio/wav", "previews")).status), name);
    }
    assert.equal((await put("clip.mp3", HTML, "audio/mpeg", "previews")).data.error.code, "content_mismatch");
    assert.equal((await put("clip.wav", WAV, "text/html", "previews")).status, 201);
    // Customers can't upload any of it.
    const { c: customer } = await newBuyer(ctx.mock.url, "uploader");
    for (const path of ["files", "previews"]) assert.equal((await customer.req("PUT", `/api/admin/${path === "files" ? "products/vj-loops/files" : "previews"}?filename=a.zip`, { raw: ZIP })).status, 404);
  });

  test("the owner can hide, show and remove a product; price and text aren't the Control Center's; only the owner can", async () => {
    const admin = await adminClient(ctx.mock.url);
    const patch = (body, id = "vj-loops", c = admin) => c.req("PATCH", `/api/admin/products/${id}`, { body });
    const row = () => sql(ctx.mock.stateDir, "SELECT price_cents, title, description, published, deleted_at IS NOT NULL AS deleted FROM products WHERE id = 'vj-loops'")[0];
    const before = row();
    const { c: customer } = await newBuyer(ctx.mock.url, "price-thief");
    for (const body of [{ salesPaused: true }, { published: false }, { deleted: true }]) assert.equal((await patch(body, "vj-loops", customer)).status, 404, JSON.stringify(body));
    assert.equal((await patch({ published: false }, "vj-loops", new Client(ctx.mock.url))).status, 404);
    // Bad input, and the creator's own fields, change nothing.
    for (const body of [{}, { priceCents: 1 }, { title: "Mine now" }, { description: "x" }, { published: "yes" }, { deleted: 1 }, { deleted: true, published: true }]) {
      assert.equal((await patch(body)).status, 400, JSON.stringify(body));
    }
    assert.deepEqual(row(), before);
    assert.equal((await patch({ published: false }, "no-such-product")).status, 404);
    assert.equal((await patch({ deleted: true })).status, 200);
    assert.equal((await new Client(ctx.mock.url).get("/api/products/vj-loops")).status, 404, "removed products leave the store");
    assert.deepEqual(row(), { ...before, published: 0, deleted: 1 });
    assert.equal((await patch({ deleted: false, published: Boolean(before.published) })).status, 200);
    assert.deepEqual(row(), before, "restored as it was");
    const log = sql(ctx.mock.stateDir, "SELECT action FROM admin_audit WHERE target_id = 'vj-loops' AND action = 'product.changed_by_admin'");
    assert.ok(log.length >= 2, "each change is in the audit log under the owner's name");
  });

  test("the Pack Builder lists Pacs from the database, not from code", async () => {
    const admin = await adminClient(ctx.mock.url);
    const r = await admin.get("/api/admin/pacs");
    assert.equal(r.status, 200);
    const live = sql(ctx.mock.stateDir, "SELECT id FROM pacs WHERE deleted_at IS NULL ORDER BY id").map((x) => x.id);
    assert.deepEqual(r.data.pacs.map((x) => x.id).sort(), live);
    const products = (await admin.get("/api/admin/products")).data;
    assert.equal(typeof products.pacs, "object", "Pac titles for the files list");
  });

  test("release artwork moves into the creator's storage once: audited, idempotent, refused while impersonating", async () => {
    const admin = await freshAdmin(ctx.mock.url);
    const hail = sql(ctx.mock.stateDir, "SELECT id FROM project_releases WHERE slug = 'hail' AND deleted_at IS NULL")[0].id;
    const artwork = () => JSON.parse(sql(ctx.mock.stateDir, `SELECT artwork FROM project_releases WHERE id = '${hail}'`)[0].artwork);
    const old = artwork();
    assert.equal(old.src, "/img/releases/hail.jpg", "the page works from the site's file until the move");
    assert.ok((await admin.get("/api/admin/content/artwork")).data.pending.some((p) => p.releaseId === hail && p.src === old.src));
    // While impersonating, the admin is the customer: nothing moves.
    const { user } = await newBuyer(ctx.mock.url, "artwork-customer");
    await admin.post(`/api/admin/customers/${user.id}/impersonate`, {});
    assert.ok([403, 404].includes((await admin.post("/api/admin/content/artwork/move", {})).status));
    await admin.post("/api/impersonation/exit", {});
    assert.deepEqual(artwork(), old);

    const r = await admin.post("/api/admin/content/artwork/move", {});
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const moved = r.data.moved.find((m) => m.releaseId === hail);
    assert.ok(moved, JSON.stringify(r.data));
    assert.deepEqual(artwork(), { asset: moved.asset, width: old.width, height: old.height, alt: old.alt });
    const asset = sql(ctx.mock.stateDir, `SELECT a.content_type, a.status, a.creator_id, p.creator_id AS owner FROM site_assets a, project_releases x
      JOIN projects p ON p.id = x.project_id WHERE a.id = '${moved.asset}' AND x.id = '${hail}'`)[0];
    assert.deepEqual([asset.content_type, asset.status, asset.creator_id], ["image/jpeg", "active", asset.owner], "stored as the creator's image");
    assert.equal((await new Client(ctx.mock.url).get(`/media/sites/${moved.asset}`)).status, 200);
    // Running it again moves nothing and stores nothing.
    const files = sql(ctx.mock.stateDir, "SELECT COUNT(*) AS n FROM site_assets")[0].n;
    const again = await admin.post("/api/admin/content/artwork/move", {});
    assert.deepEqual([again.status, again.data.moved, again.data.remaining], [200, [], 0]);
    assert.equal(sql(ctx.mock.stateDir, "SELECT COUNT(*) AS n FROM site_assets")[0].n, files);
    assert.ok(sql(ctx.mock.stateDir, "SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'release.artwork_moved'")[0].n >= 2);
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

  test("summary alerts: a refused payment is critical, a parked refund only waits, and no customer email leaks", async () => {
    const admin = await adminClient(ctx.mock.url);
    const tag = unique("alert").replace(/[^a-z0-9]/gi, "");
    const ids = [`mock:crit_${tag}`, `mock:wait_${tag}`, `mock:warn_${tag}`];
    sql(ctx.mock.stateDir, `INSERT INTO payment_events (id, provider, type, order_id, livemode, outcome, detail, received_at) VALUES
      ('${ids[0]}', 'mock', 'mock.paid', 'ord_${tag}', 0, 'rejected', 'amount mismatch for someone@example.com', '2099-01-01T00:00:03.000Z'),
      ('${ids[1]}', 'mock', 'charge.refunded', NULL, 0, 'refund waiting for payment', 'pi_${tag}', '2099-01-01T00:00:02.000Z'),
      ('${ids[2]}', 'mock', 'charge.refunded', 'ord_${tag}', 0, 'rejected', 'live/test mode mismatch', '2099-01-01T00:00:01.000Z')`);
    try {
      const alerts = (await admin.get("/api/admin/summary")).data.alerts.filter((a) => ids.includes(a.id));
      assert.deepEqual(alerts.map((a) => [a.id, a.severity]), [[ids[0], "critical"], [ids[2], "warning"], [ids[1], "info"]], "most serious first");
      assert.equal(alerts[0].orderId, `ord_${tag}`);
      assert.equal(alerts[0].receivedAt, "2099-01-01T00:00:03.000Z", "the full time");
      assert.ok(alerts.every((a) => a.next), "each kind says what to do next");
      assert.doesNotMatch(JSON.stringify(alerts), /someone@example\.com/);
    } finally {
      sql(ctx.mock.stateDir, `DELETE FROM payment_events WHERE id IN ('${ids.join("', '")}')`);
    }
  });

  test("/admin is the site's 404 page unless you're signed in to an admin account", async () => {
    const notFound = (r, who) => {
      assert.equal(r.status, 404, who);
      assert.doesNotMatch(String(r.data), /admin-app|Control Center/, who);
      assert.match(String(r.data), /<html/, `${who}: the site's own 404 page`);
    };
    notFound(await new Client(ctx.mock.url).get("/admin"), "signed out");
    const { c, user } = await newBuyer(ctx.mock.url, "admin-page-customer");
    notFound(await c.get("/admin"), "customer");
    const anonHtml = await new Client(ctx.mock.url).get("/admin.html");
    assert.doesNotMatch(String(anonHtml.data), /admin-app/, "no way round it through the .html address");
    const admin = await freshAdmin(ctx.mock.url);
    const page = await admin.get("/admin");
    assert.equal(page.status, 200);
    assert.match(String(page.data), /id="admin-app"/);
    assert.equal(page.headers.get("cache-control"), "no-store");
    // While impersonating, the admin is the customer: no Control Center until they exit.
    await admin.post(`/api/admin/customers/${user.id}/impersonate`, {});
    notFound(await admin.get("/admin"), "impersonating");
    await admin.post("/api/impersonation/exit", {});
    assert.equal((await admin.get("/admin")).status, 200);
  });
});

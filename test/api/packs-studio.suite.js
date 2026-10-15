// Pack Builder for Studio creators (docs/packs.md, Phase 5): a creator builds their own product's Pac (made on first
// use), a clean version publishes at once, a flagged one waits for an admin with its reasons, the admin approves
// (audited override) or rejects it, "always hold" holds everything, uploads count against the creator's file storage
// with no way to race past it, and nobody reaches another creator's packs (404) or changes them while impersonating.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "../support/client.js";
import { newBuyer, adminClient, freshAdmin } from "../support/flows.js";
import * as P from "../support/packs.js";

const { caseZip, create, build, S } = P;

export default (ctx) => describe("packs in the Studio", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);

  const creatorWithProducts = (tag, n) => P.creatorWithProducts(base(), tag, n);

  test("a creator's clean pack publishes at once into their own product; its Pac is made on first use", async () => {
    const { c, products: [product] } = await creatorWithProducts("pk-clean");
    const first = await c.get(`${S}/products/${product.id}`);
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.pac, null, "looking makes nothing");
    assert.equal(first.data.storage.usedBytes, 0);
    assert.equal(first.data.storage.quotaBytes, 500 * 1024 * 1024);
    assert.equal(db(`SELECT pacs FROM products WHERE id = '${product.id}'`)[0].pacs, "[]");

    const { version } = await build(c, product.id, caseZip("pack-basic"));
    const pacId = (await c.get(`${S}/products/${product.id}`)).data.pac.id;
    assert.match(pacId, /^pc_/, "the first upload made the Pac");
    assert.deepEqual(JSON.parse(db(`SELECT pacs FROM products WHERE id = '${product.id}'`)[0].pacs), [pacId]);
    // A checked file keeps its type: renaming it into a program after the review is refused.
    const readme = version.files.find((f) => f.filename === "Read me.txt");
    const bat = await c.req("PATCH", `${S}/versions/${version.id}/files/${readme.assetId}`, { body: { filename: "Install.bat" } });
    assert.equal(bat.data.error.code, "extension_changed");
    assert.equal((await c.req("PATCH", `${S}/versions/${version.id}/files/${readme.assetId}`, { body: { filename: "About.TXT" } })).status, 200);
    assert.equal(version.status, "ready", JSON.stringify(version));
    assert.equal(version.stats.review.verdict, "pass");
    const pub = await c.post(`${S}/versions/${version.id}/publish`, {});
    assert.equal(pub.status, 200, JSON.stringify(pub.data));
    assert.equal(pub.data.version.status, "published");
    const rows = db(`SELECT COUNT(*) AS n FROM product_files WHERE product_id = '${product.id}' AND version_id = '${version.id}' AND active = 1 AND status = 'published'`);
    assert.equal(rows[0].n, version.stats.files);
    assert.ok((await c.get(`${S}/products/${product.id}`)).data.storage.usedBytes > 0, "published files count against storage");
    // Pack files are managed in the Pack Builder: the one-file list only counts them and can't remove one.
    const listed = (await c.get(`/api/studio/projects/${db(`SELECT project_id FROM products WHERE id = '${product.id}'`)[0].project_id}/products`)).data.products.find((p) => p.id === product.id);
    assert.equal(listed.packFiles, version.stats.files);
    assert.equal(listed.files.length, 0);
    const oneId = db(`SELECT id FROM product_files WHERE version_id = '${version.id}' LIMIT 1`)[0].id;
    assert.equal((await c.req("DELETE", `/api/studio/products/${product.id}/files/${oneId}`)).data.error.code, "in_pack");
  });

  test("a flagged pack waits for an admin with its reasons; the admin's approval is an audited override", async () => {
    const { c, products: [product] } = await creatorWithProducts("pk-held");
    const { version } = await build(c, product.id, caseZip("unsafe-paths"));
    assert.equal(version.status, "ready", JSON.stringify(version));
    assert.equal(version.stats.review.verdict, "hold");
    assert.ok(version.stats.review.flags.some((f) => f.code === "unsafe_entries" && f.hard));

    const held = await c.post(`${S}/versions/${version.id}/publish`, {});
    assert.equal(held.status, 202, JSON.stringify(held.data));
    assert.equal(held.data.version.status, "in_review");
    assert.equal((await c.post(`${S}/versions/${version.id}/publish`, {})).data.error.code, "not_ready", "the creator can't push it through");
    assert.equal(db(`SELECT COUNT(*) AS n FROM product_files WHERE version_id = '${version.id}'`)[0].n, 0);

    const admin = await adminClient(base());
    const queue = await admin.get("/api/admin/packs/review");
    const row = queue.data.versions.find((v) => v.id === version.id);
    assert.ok(row, "the held version is in the review queue");
    assert.ok(row.flags.some((f) => f.code === "unsafe_entries"));
    assert.equal((await c.get("/api/admin/packs/review")).status, 404, "the queue is admin-only");

    const ok = await admin.post(`/api/admin/packs/versions/${version.id}/publish`, {});
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.version.status, "published");
    const logged = db(`SELECT action, detail FROM admin_audit WHERE action = 'pack.version_approved' AND detail LIKE '%${version.id}%'`);
    assert.equal(logged.length, 1);
    assert.match(logged[0].detail, /unsafe_entries/);
    assert.ok(db(`SELECT reviewed_by FROM pac_versions WHERE id = '${version.id}'`)[0].reviewed_by);
  });

  test("always hold: even a clean pack waits; a rejection gives the reason, drops the archive and frees the Pac", async () => {
    const { c, creator, products: [product] } = await creatorWithProducts("pk-always");
    const admin = await adminClient(base());
    assert.equal((await admin.req("PATCH", `/api/admin/creators/${creator.id}`, { body: { packReview: "sometimes" } })).status, 400);
    assert.equal((await admin.req("PATCH", `/api/admin/creators/${creator.id}`, { body: { packReview: "always_hold" } })).status, 200);
    const { version } = await build(c, product.id, caseZip("pack-basic"));
    assert.equal(version.stats.review.verdict, "pass");
    assert.equal((await c.post(`${S}/versions/${version.id}/publish`, {})).data.version.status, "in_review");

    assert.equal((await c.post(`/api/admin/packs/versions/${version.id}/reject`, { note: "x" })).status, 404, "creators can't reject");
    const no = await admin.post(`/api/admin/packs/versions/${version.id}/reject`, { note: "Please label the drums." });
    assert.equal(no.status, 200, JSON.stringify(no.data));
    assert.equal(no.data.version.status, "failed");
    const after = await c.get(`${S}/products/${product.id}`);
    assert.equal(after.data.versions.find((v) => v.id === version.id).note, "Please label the drums.", "the creator sees why");
    assert.equal(after.data.versions.find((v) => v.id === version.id).rejected, true, "told apart from a processing failure");
    assert.equal((await c.get(`${S}/versions/${version.id}`)).data.version.rejected, true);
    assert.equal(after.data.pac.draftVersionId, null, "the Pac is free again");
    assert.equal(db(`SELECT COUNT(*) AS n FROM uploads WHERE version_id = '${version.id}' AND status <> 'aborted'`)[0].n, 0);
    assert.equal((await admin.post(`/api/admin/packs/versions/${version.id}/reject`, {})).status, 409, "only once");
    assert.equal(db(`SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'pack.version_rejected' AND detail LIKE '%${version.id}%'`)[0].n, 1);
  });

  test("storage quota: two uploads at once can't both fit; a refused one leaves no version behind", async () => {
    const { c, creator, products: [a, b] } = await creatorWithProducts("pk-quota", 2);
    const zip = caseZip("pack-basic");
    db(`UPDATE creators SET files_quota_bytes = ${Math.floor(zip.length * 1.5)} WHERE id = '${creator.id}'`);
    const [r1, r2] = await Promise.all([create(c, a.id, zip), create(c, b.id, zip)]);
    assert.deepEqual([r1.status, r2.status].sort(), [201, 409]);
    const refused = r1.status === 409 ? r1 : r2;
    assert.equal(refused.data.error.code, "quota_exceeded");
    assert.equal(db(`SELECT COUNT(*) AS n FROM pac_versions v JOIN products p ON p.id = v.product_id WHERE p.id IN ('${a.id}', '${b.id}') AND v.status IN ('draft', 'uploading')`)[0].n, 1);
    const free = r1.status === 409 ? a : b;
    assert.equal((await c.get(`${S}/products/${free.id}`)).data.pac.draftVersionId, null, "the refused product's Pac stays free");
    // The reserved archive counts for single-file uploads too.
    const one = await c.req("PUT", `/api/studio/products/${free.id}/files?filename=kick.wav`, { raw: Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(Math.floor(zip.length * 0.6))]), headers: { "Content-Type": "audio/wav" } });
    assert.equal(one.data.error.code, "quota_exceeded");
  });

  test("a refused upload's key stays refused; quota counts the files unpacked, not the archive", async () => {
    const { c, creator, products: [product] } = await creatorWithProducts("pk-unpack");
    const zip = caseZip("pack-basic");
    db(`UPDATE creators SET files_quota_bytes = 10 WHERE id = '${creator.id}'`);
    const key = crypto.randomUUID();
    const body = { filename: "kit.zip", size: zip.length, idempotencyKey: key };
    assert.equal((await c.post(`${S}/products/${product.id}/versions`, body)).data.error.code, "quota_exceeded");
    assert.equal((await c.post(`${S}/products/${product.id}/versions`, body)).data.error.code, "version_closed", "a retry with the same key");
    // Room for the archive (27 KB) but not its 1.2 MB of files: the check fails it, nothing is claimed.
    db(`UPDATE creators SET files_quota_bytes = ${zip.length + 1000} WHERE id = '${creator.id}'`);
    const { version } = await build(c, product.id, zip);
    assert.equal(version.status, "failed");
    assert.equal(version.note, "quota_exceeded");
    assert.equal((await c.get(`${S}/products/${product.id}`)).data.pac.draftVersionId, null);
  });

  test("a product whose Pac was deleted gets a new one on its next upload", async () => {
    const { c, products: [product] } = await creatorWithProducts("pk-gone");
    const { version } = await build(c, product.id, caseZip("pack-basic"));
    assert.equal((await c.post(`${S}/versions/${version.id}/discard`, {})).status, 200);
    const old = JSON.parse(db(`SELECT pacs FROM products WHERE id = '${product.id}'`)[0].pacs)[0];
    db(`UPDATE pacs SET deleted_at = '2026-01-01T00:00:00.000Z' WHERE id = '${old}'`);
    assert.equal((await c.get(`${S}/products/${product.id}`)).data.pac, null);
    const made = await create(c, product.id, caseZip("pack-basic"));
    assert.equal(made.status, 201, JSON.stringify(made.data));
    const now = JSON.parse(db(`SELECT pacs FROM products WHERE id = '${product.id}'`)[0].pacs);
    assert.equal(now.length, 1);
    assert.notEqual(now[0], old);
    assert.equal(db(`SELECT pac_id FROM pac_versions WHERE id = '${made.data.version.id}'`)[0].pac_id, now[0]);
  });

  test("nobody reaches another creator's packs: 404 everywhere, and no changes while impersonating", async () => {
    const owner = await creatorWithProducts("pk-owner");
    const product = owner.products[0];
    const created = await create(owner.c, product.id, caseZip("pack-basic"));
    const { version, upload } = created.data;
    const other = await creatorWithProducts("pk-other");
    const { c: buyer } = await newBuyer(base(), "pk-buyer");
    for (const x of [other.c, buyer]) {
      assert.equal((await x.get(`${S}/products/${product.id}`)).status, 404);
      assert.equal((await create(x, product.id, caseZip("pack-basic"))).status, 404);
      assert.equal((await x.get(`${S}/versions/${version.id}`)).status, 404);
      assert.equal((await x.post(`${S}/versions/${version.id}/publish`, {})).status, 404);
      assert.equal((await x.post(`${S}/versions/${version.id}/discard`, {})).status, 404);
      assert.equal((await x.req("PUT", `${S}/versions/${version.id}/values`, { body: { assetIds: [], field: "kind", value: "loops" } })).status, 404);
      assert.equal((await x.req("PUT", `${S}/uploads/${upload.uploadId}/parts/1`, { raw: Buffer.alloc(30), headers: { "Content-Type": "application/octet-stream" } })).status, 404);
      assert.equal((await x.post(`${S}/uploads/${upload.uploadId}/complete`, {})).status, 404);
    }
    // A catalog product (not the creator's) is no Studio product either.
    assert.equal((await other.c.get(`${S}/products/sample-pack-vol1`)).status, 404);

    // Support impersonation can look but not change a creator's packs.
    const admin = await freshAdmin(base());
    const start = await admin.post(`/api/admin/customers/${owner.user.id}/impersonate`, { note: "pack support check" });
    assert.equal(start.status, 201, JSON.stringify(start.data));
    assert.equal((await admin.get(`${S}/versions/${version.id}`)).status, 200);
    assert.equal((await admin.post(`${S}/versions/${version.id}/discard`, {})).status, 403);
    assert.equal((await admin.post(`${S}/products/${product.id}/versions`, { filename: "k.zip", size: 100, idempotencyKey: crypto.randomUUID() })).status, 403);
    assert.equal(db(`SELECT status FROM pac_versions WHERE id = '${version.id}'`)[0].status, "uploading");
  });
});

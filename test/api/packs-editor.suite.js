// The Pac editor (server/packs/editor-routes.js; docs/packs.md, "Pac editor"): a creator builds a Pac one thing at a time.
// A draft starts empty or as a copy of the live version; files are added in steps, each checked by its own engine job
// and merged without touching the draft's edits; folders are made and removed, files removed, a read me written here;
// a name already taken is refused; one addition at a time; publishing waits for an open addition and sees what the
// steps changed (a large removal is held). Nobody else's drafts, ever.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "../support/client.js";
import * as P from "../support/packs.js";

const { S, caseZip } = P;
const key = () => crypto.randomUUID();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default (ctx) => describe("packs: the Pac editor", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);

  // Adds the conformance case `name` to a version, into folderId; → { addition, version } when it's checked.
  async function add(c, versionId, name, folderId = null, { complete = true } = {}) {
    const zip = caseZip(name);
    const made = await c.post(`${S}/versions/${versionId}/additions`, { filename: `${name}.zip`, size: zip.length, folderId, idempotencyKey: key() });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    const put = await c.req("PUT", `${S}/uploads/${made.data.upload.uploadId}/parts/1`, { raw: zip, headers: { "Content-Type": "application/octet-stream" } });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    if (!complete) return made.data;
    let res = await c.post(`${S}/additions/${made.data.addition.id}/complete`, {});
    assert.equal(res.status, 200, JSON.stringify(res.data));
    for (let i = 0; i < 60 && res.data.addition.status === "processing"; i++) (await wait(200), (res = await c.get(`${S}/additions/${made.data.addition.id}`)));
    return res.data;
  }
  const names = (v) => v.files.map((f) => `${f.folderPath ? `${f.folderPath}/` : ""}${f.filename}`).sort();

  test("an empty draft built one step at a time, then published", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "ed-build");
    const pid = products[0].id;
    const d = await c.post(`${S}/products/${pid}/drafts`, { idempotencyKey: key() });
    assert.equal(d.status, 201, JSON.stringify(d.data));
    let v = d.data.version;
    assert.equal(v.status, "ready");
    assert.deepEqual(v.files, []);
    // Files go in, with a folder from the archive; the draft stays ready the whole time.
    const first = await add(c, v.id, "addition");
    assert.equal(first.addition.status, "done", JSON.stringify(first.addition));
    v = first.version;
    assert.deepEqual(names(v), ["Fills/Fill 01.wav", "Read me.txt", "Snare 02.wav"]);
    assert.equal(v.stats.files, 3);
    // A folder made here, a file moved into it, a read me written here (replacing the one that came in: same asset).
    const extras = (await c.post(`${S}/versions/${v.id}/folders`, { name: "Extras" })).data.version.folders.find((f) => f.name === "Extras");
    const snare = v.files.find((f) => f.filename === "Snare 02.wav");
    await c.post(`${S}/versions/${v.id}/move`, { assetIds: [snare.assetId], folderId: extras.id });
    const readme = v.files.find((f) => f.filename === "Read me.txt");
    const w = await c.req("PUT", `${S}/versions/${v.id}/readme`, { body: { text: "Thanks for the support.\nAll loops 128 BPM." } });
    assert.equal(w.status, 200, JSON.stringify(w.data));
    v = w.data.version;
    const again = v.files.find((f) => f.filename === "Read me.txt");
    assert.equal(again.assetId, readme.assetId, "the same file, new text");
    assert.notEqual(again.sha256, readme.sha256);
    assert.deepEqual(names(v), ["Extras/Snare 02.wav", "Fills/Fill 01.wav", "Read me.txt"]);
    // Taken names and bad input are refused; removing a folder takes its files.
    assert.equal((await c.post(`${S}/versions/${v.id}/folders`, { name: "extras" })).data.error.code, "name_taken");
    assert.equal((await c.req("PUT", `${S}/versions/${v.id}/readme`, { body: { text: "x", filename: "notes.exe" } })).status, 400);
    const fills = v.folders.find((f) => f.name === "Fills");
    v = (await c.req("DELETE", `${S}/versions/${v.id}/folders/${fills.id}`)).data.version;
    assert.deepEqual(names(v), ["Extras/Snare 02.wav", "Read me.txt"]);
    assert.equal(v.stats.files, 2);
    const pub = await c.post(`${S}/versions/${v.id}/publish`, {});
    assert.equal(pub.status, 200, JSON.stringify(pub.data));
    const rows = db(`SELECT filename, folder_path FROM product_files WHERE product_id = '${pid}' AND active = 1 ORDER BY filename`);
    assert.deepEqual(rows.map((r) => `${r.folder_path ? `${r.folder_path}/` : ""}${r.filename}`).sort(), ["Extras/Snare 02.wav", "Read me.txt"]);
  });

  test("a draft copied from the live version: same files and ids; taken names refused; one addition at a time", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "ed-copy");
    const pid = products[0].id;
    const { version: live } = await P.build(c, pid, caseZip("pack-basic"));
    assert.equal((await c.post(`${S}/versions/${live.id}/publish`, {})).status, 200);
    const liveIds = db(`SELECT id, asset_id FROM product_files WHERE product_id = '${pid}' AND active = 1`);
    let v = (await c.post(`${S}/products/${pid}/drafts`, { idempotencyKey: key() })).data.version;
    assert.equal(v.status, "ready");
    assert.deepEqual(names(v), names(live), "a copy of the live version");
    assert.deepEqual(v.files.map((f) => f.assetId).sort(), live.files.map((f) => f.assetId).sort());
    assert.deepEqual(v.stats.diff.counts, { same: live.files.length, moved: 0, replaced: 0, added: 0, removed: 0 });
    // The read me's name is taken at the top: refused there; the rest go in.
    const added = await add(c, v.id, "addition");
    assert.equal(added.addition.status, "done");
    assert.deepEqual(added.addition.stats.refused.map((r) => [r.path, r.codes[0]]), [["Read me.txt", "duplicate_name"]]);
    assert.equal(added.version.stats.diff.counts.added, 2);
    // One addition at a time; publishing waits for it.
    const open = await add(c, v.id, "addition", null, { complete: false });
    const zip = caseZip("addition");
    const second = await c.post(`${S}/versions/${v.id}/additions`, { filename: "x.zip", size: zip.length, idempotencyKey: key() });
    assert.equal(second.data.error.code, "addition_open");
    assert.equal((await c.post(`${S}/versions/${v.id}/publish`, {})).data.error.code, "addition_open");
    // Discarding the draft ends it, and the live version is untouched.
    assert.equal((await c.post(`${S}/versions/${v.id}/discard`, {})).status, 200);
    assert.equal(db(`SELECT status FROM pac_additions WHERE id = '${open.addition.id}'`)[0].status, "failed");
    assert.deepEqual(db(`SELECT id, asset_id FROM product_files WHERE product_id = '${pid}' AND active = 1`), liveIds);
  });

  test("what the steps change is reviewed at publish: removing most of the live version waits for an admin", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "ed-review");
    const pid = products[0].id;
    const { version: live } = await P.build(c, pid, caseZip("pack-basic"));
    assert.equal((await c.post(`${S}/versions/${live.id}/publish`, {})).status, 200);
    let v = (await c.post(`${S}/products/${pid}/drafts`, { idempotencyKey: key() })).data.version;
    v = (await c.post(`${S}/versions/${v.id}/remove`, { assetIds: v.files.slice(0, 4).map((f) => f.assetId) })).data.version;
    assert.equal(v.stats.diff.counts.removed, 4);
    assert.ok(v.stats.review.flags.some((f) => f.code === "big_revision"));
    const pub = await c.post(`${S}/versions/${v.id}/publish`, {});
    assert.equal(pub.status, 202);
    assert.equal(pub.data.version.status, "in_review");
  });

  test("nobody reaches another creator's draft; the switch turns the editor off", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "ed-own");
    const v = (await c.post(`${S}/products/${products[0].id}/drafts`, { idempotencyKey: key() })).data.version;
    const other = await P.creatorWithProducts(base(), "ed-other");
    for (const [m, path, body] of [["POST", `/versions/${v.id}/folders`, { name: "x" }], ["POST", `/versions/${v.id}/remove`, { assetIds: ["as_aaaa"] }],
      ["PUT", `/versions/${v.id}/readme`, { text: "x" }], ["POST", `/versions/${v.id}/additions`, { filename: "a.zip", size: 100, idempotencyKey: key() }],
      ["POST", `/products/${products[0].id}/drafts`, { idempotencyKey: key() }]]) {
      assert.equal((await other.c.req(m, `${S}${path}`, { body })).status, 404, `${m} ${path}`);
    }
  });

  test("previews: up to three clips, only this Pac's files as sources; public with the read me once on sale", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "ed-previews");
    const pid = products[0].id;
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(3000)]);
    const clip = (title, extra = "") => c.req("POST", `${S}/products/${pid}/previews?filename=clip.wav&title=${encodeURIComponent(title)}${extra}`, { raw: wav, headers: { "Content-Type": "audio/wav" } });
    // Built with a read me, then published and put on sale.
    let v = (await c.post(`${S}/products/${pid}/drafts`, { idempotencyKey: key() })).data.version;
    v = (await add(c, v.id, "addition")).version;
    v = (await c.req("PUT", `${S}/versions/${v.id}/readme`, { body: { text: "Thanks!\nAll at 128 BPM." } })).data.version;
    const snare = v.files.find((f) => f.filename === "Snare 02.wav");
    const one = await clip("Groove", `&asset=${snare.assetId}`);
    assert.equal(one.status, 200, JSON.stringify(one.data));
    assert.equal((await c.req("POST", `${S}/products/${pid}/previews?filename=clip.wav`, { raw: Buffer.from("not audio at all, not even close"), headers: { "Content-Type": "audio/wav" } })).data.error.code, "content_mismatch");
    assert.equal((await clip("Two")).status, 200);
    assert.equal((await clip("Three")).status, 200);
    assert.equal((await clip("Four")).data.error.code, "previews_full");
    // A source from another Pac is refused.
    const other = await P.creatorWithProducts(base(), "ed-previews-other");
    const ov = (await other.c.post(`${S}/products/${other.products[0].id}/drafts`, { idempotencyKey: key() })).data.version;
    const oa = (await add(other.c, ov.id, "addition")).version.files[0].assetId;
    const list = (await c.get(`${S}/products/${pid}/previews`)).data.previews;
    assert.equal((await c.req("DELETE", `${S}/products/${pid}/previews/${list[1].id}`)).status, 200);
    assert.equal((await clip("Cross", `&asset=${oa}`)).data.error.code, "invalid_asset");
    // And nobody else's.
    assert.equal((await other.c.get(`${S}/products/${pid}/previews`)).status, 404);
    assert.equal((await other.c.req("DELETE", `${S}/products/${pid}/previews/${list[0].id}`)).status, 404);
    assert.equal((await c.post(`${S}/versions/${v.id}/publish`, {})).status, 200);
    db(`UPDATE products SET price_cents = 0 WHERE id = '${pid}'`);
    assert.equal((await c.req("PATCH", `/api/studio/products/${pid}`, { body: { published: true } })).status, 200);
    const inside = (await fetch(`${base()}/api/products/${pid}/contents`).then((r) => r.json()));
    assert.deepEqual(inside.previews.map((x) => x.title), ["Groove", "Three"]);
    assert.ok(inside.previews.every((x) => x.url.startsWith("/media/previews/")));
    assert.equal(inside.readme, "Thanks!\nAll at 128 BPM.");
    // A buyer's Your Stacc gets them too.
    const buyer = await P.creatorWithProducts(base(), "ed-previews-buyer");
    assert.equal((await buyer.c.post("/api/library/free", { productId: pid })).status, 200);
    const item = (await buyer.c.get("/api/library")).data.items.find((x) => x.productId === pid);
    assert.equal(item.readme, "Thanks!\nAll at 128 BPM.");
    assert.equal(item.previews.length, 2);
  });
});

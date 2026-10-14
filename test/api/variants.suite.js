// Deflate variants for ZIP downloads (server/downloads/variants.js; switch downloads.deflate, on for this group with
// FEATURES_ON): the sweep makes a checked deflated copy of a published text file that shrinks, never of audio; a ZIP
// then carries it deflated, and unzipping gives back the original bytes (the ZIP's CRC is the original's).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "../support/client.js";
import { newBuyer, mockBuy, adminClient } from "../support/flows.js";
import { entries as zipEntries } from "../mock-engine/server.js";
import { SWEEP_TOKEN } from "./packs.suite.js";
import * as P from "../support/packs.js";

const PRODUCT = "sample-pack-vol1";
const PAC = "frayed-signals-samples";
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default (ctx) => describe("ZIP downloads: deflate variants", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);

  test("a published text file gets a checked deflated copy, carried deflated in a ZIP; audio never does", async () => {
    const admin = await adminClient(base());
    const zip = P.caseZip("analysis");
    const created = await admin.post(`/api/admin/packs/${PAC}/versions`, { productId: PRODUCT, filename: "pack.zip", size: zip.length, idempotencyKey: crypto.randomUUID() });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const { version, upload } = created.data;
    assert.equal((await admin.send("PUT", `/api/admin/packs/uploads/${upload.uploadId}/parts/1`, { raw: zip, headers: { "Content-Type": "application/octet-stream" } })).status, 200);
    let v = (await admin.post(`/api/admin/packs/uploads/${upload.uploadId}/complete`, {})).data.version;
    for (let i = 0; i < 60 && v.status === "processing"; i++) (await wait(250), (v = (await admin.get(`/api/admin/packs/versions/${version.id}`)).data.version));
    assert.ok(["ready", "in_review"].includes(v.status), v.status);
    assert.equal((await admin.post(`/api/admin/packs/versions/${version.id}/publish`, {})).status, 200);

    const res = await (await fetch(`${base()}/api/internal/sweep`, { method: "POST", headers: { Authorization: `Bearer ${SWEEP_TOKEN}` } })).json();
    assert.ok(res.variants >= 1, JSON.stringify(res));
    const notes = v.files.find((f) => f.filename === "Notes.txt");
    const blob = db(`SELECT compress_ratio, deflate_bytes FROM blobs WHERE sha256 = '${notes.sha256}'`)[0];
    assert.ok(blob.deflate_bytes > 0 && blob.compress_ratio <= 0.8, JSON.stringify(blob));
    assert.equal(db(`SELECT COUNT(*) AS n FROM blobs WHERE format = 'wav' AND deflate_bytes IS NOT NULL`)[0].n, 0, "audio is never deflated");

    const { c } = await newBuyer(base(), "variants-buyer");
    await mockBuy(c, [{ productId: PRODUCT }]);
    const files = (await c.get("/api/library")).data.items.find((p) => p.productId === PRODUCT).files;
    const ids = files.filter((f) => f.filename === "Notes.txt" || f.filename === "Loop A.wav").map((f) => f.id);
    assert.equal(ids.length, 2);
    const made = await c.post("/api/downloads/bundle", { fileIds: ids });
    assert.equal(made.status, 200, JSON.stringify(made.data));
    const got = await fetch(base() + made.data.url, { headers: { Cookie: c.cookieHeader(), "cf-connecting-ip": c.ip } });
    const bytes = Buffer.from(await got.arrayBuffer());
    assert.equal(Number(got.headers.get("content-length")), bytes.length);
    const inside = zipEntries(bytes);
    const want = new Map(v.files.map((f) => [f.filename, f.sha256]));
    for (const [name, read] of inside) assert.equal(sha(read()), want.get(name.split("/").pop()), `${name} unzips to its original`);
    // The text entry is deflated (method 8), the WAV stored (0): read from the central directory.
    const methods = [];
    for (let p = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), cd = bytes.readUInt32LE(p + 16), n = bytes.readUInt16LE(p + 10), i = 0; i < n; i++) {
      const len = bytes.readUInt16LE(cd + 28), extra = bytes.readUInt16LE(cd + 30);
      methods.push([bytes.subarray(cd + 46, cd + 46 + len).toString().split("/").pop(), bytes.readUInt16LE(cd + 10)]);
      cd += 46 + len + extra;
    }
    assert.deepEqual(Object.fromEntries(methods), { "Notes.txt": 8, "Loop A.wav": 0 });
  });
});

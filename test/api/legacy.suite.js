// Files from before the Pack Builder (server/files/legacy.js): the daily sweep records each one's SHA-256 and CRC-32 from
// its stored bytes, after which it joins ZIP downloads byte for byte; a file whose object is missing is marked and the
// admins told, never retried; how files are delivered doesn't change.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "../support/client.js";
import { newBuyer, mockBuy, adminClient } from "../support/flows.js";
import { entries as zipEntries } from "../mock-engine/server.js";
import { SWEEP_TOKEN } from "./packs.suite.js";

const PRODUCT = "sample-pack-vol1";
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

export default (ctx) => describe("legacy files: checksums", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);
  const sweep = async () => (await fetch(`${base()}/api/internal/sweep`, { method: "POST", headers: { Authorization: `Bearer ${SWEEP_TOKEN}` } })).json();

  test("hashed by the sweep from the stored bytes, then downloadable in a ZIP", async () => {
    const admin = await adminClient(base());
    const bytes = Buffer.concat([Buffer.from("PK\u0003\u0004", "latin1"), crypto.randomBytes(70000)]);
    const up = await admin.req("PUT", `/api/admin/products/${PRODUCT}/files?filename=extras.zip&label=Extras`, { raw: bytes, headers: { "Content-Type": "application/zip" } });
    assert.equal(up.status, 201, JSON.stringify(up.data));
    const id = up.data.fileId;
    const { c } = await newBuyer(base(), "legacy-zip");
    await mockBuy(c, [{ productId: PRODUCT }]);
    assert.equal((await c.post("/api/downloads/bundle", { fileIds: [id] })).data.error.code, "not_bundleable", "no checksum on record yet");
    // A file whose object is gone: marked, not retried.
    db(`INSERT INTO product_files (id, product_id, r2_key, filename, label, content_type, size_bytes, sort, active, created_at, kind, status, status_at)
      SELECT 'pf_legacygone', product_id, 'files/gone/none.zip', 'gone.zip', '', content_type, 10, 99, 1, '2000-01-01T00:00:00.000Z', kind, 'rejected', status_at FROM product_files WHERE id = '${id}'`);
    let found = {};
    for (let i = 0; i < 20 && !found.sha256; i++) {
      const res = await sweep();
      assert.ok(res.legacy, JSON.stringify(res));
      found = JSON.parse(db(`SELECT meta FROM product_files WHERE id = '${id}'`)[0].meta || "{}");
    }
    assert.equal(found.sha256, sha(bytes));
    assert.equal(db("SELECT json_extract(meta, '$.hashProblem') AS p FROM product_files WHERE id = 'pf_legacygone'")[0].p, "missing");
    const made = await c.post("/api/downloads/bundle", { fileIds: [id] });
    assert.equal(made.status, 200, JSON.stringify(made.data));
    const res = await fetch(base() + made.data.url, { headers: { Cookie: c.cookieHeader(), "cf-connecting-ip": c.ip } });
    const inside = zipEntries(Buffer.from(await res.arrayBuffer()));
    const [name, read] = [...inside][0];
    assert.match(name, /extras\.zip$/);
    assert.equal(sha(read()), sha(bytes), "byte for byte, and the ZIP's CRC checks out");
    db("DELETE FROM product_files WHERE id = 'pf_legacygone'");
  });
});

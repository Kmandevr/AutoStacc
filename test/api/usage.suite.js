// The budget guard (server/usage/; docs/packs.md, "Staying inside the $5 Workers Paid plan"): every finished job and
// upload is metered once; from 80% of the free allowance processing skips analysis; from 95% a new version waits for
// next month (it can be discarded) until the owner allows spending this month, and the sweep or its next look sends it,
// oldest first; creators' uploads stop at the storage cap, AutoStacc's own don't; the cap is the owner's base plus what
// active paid storage plans hold above free storage (#142). Admin only, audited. Each test puts
// the store's meters and settings back as it found them.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql } from "../support/client.js";
import { adminClient } from "../support/flows.js";
import { SWEEP_TOKEN } from "./packs.suite.js";
import * as P from "../support/packs.js";

const { S, caseZip, build } = P;
const MONTH = () => new Date().toISOString().slice(0, 7);
const ALLOWANCE_MS = 25 * 3600 * 1000;

export default (ctx) => describe("usage: the budget guard", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);
  const meter = (m) => (db(`SELECT amount FROM usage_meters WHERE month = '${MONTH()}' AND meter = '${m}'`)[0] || { amount: 0 }).amount;
  // Sets the Container meter to a share of its allowance for one test, and puts it back after.
  async function at(share, fn) {
    const was = meter("container_ms");
    db(`INSERT INTO usage_meters (month, meter, amount, updated_at) VALUES ('${MONTH()}', 'container_ms', ${Math.round(share * ALLOWANCE_MS)}, 'x')
      ON CONFLICT(month, meter) DO UPDATE SET amount = excluded.amount`);
    try { return await fn(); } finally {
      db(`UPDATE usage_meters SET amount = ${was} + (amount - ${Math.round(share * ALLOWANCE_MS)}) WHERE month = '${MONTH()}' AND meter = 'container_ms'`);
      db("DELETE FROM store_settings WHERE key IN ('usage_override', 'storage_cap_gb')");
    }
  }
  const sweep = async () => (await fetch(`${base()}/api/internal/sweep`, { method: "POST", headers: { Authorization: `Bearer ${SWEEP_TOKEN}` } })).json();

  test("a finished job and its upload are metered once", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "us-meter");
    const [ms, writes] = [meter("container_ms"), meter("class_a")];
    const { version } = await build(c, products[0].id, caseZip("pack-basic"));
    assert.equal(version.status, "ready");
    assert.ok(meter("container_ms") - ms >= 20000, "the job's time and its start-up");
    const used = meter("class_a") - writes;
    assert.ok(used >= 3 + 2, `the upload (start, a part, finish) and the job's writes: ${used}`);
    // Looking again doesn't count it again.
    await c.get(`${S}/versions/${version.id}`);
    assert.equal(meter("class_a") - writes, used);
  });

  test("from 80% analysis is skipped; from 95% a version waits, then goes once spending is allowed", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "us-pause", 3);
    await at(0.85, async () => {
      const { version } = await build(c, products[0].id, caseZip("analysis"));
      assert.equal(version.status, "ready");
      const v = (await c.get(`${S}/versions/${version.id}`)).data.version;
      assert.ok(v.files.every((f) => !f.facts.peaks && !f.suggestions.some((s) => s.origin === "analysis")), "nothing heard");
    });
    await at(0.96, async () => {
      const { version } = await build(c, products[1].id, caseZip("pack-basic"));
      assert.equal(version.status, "processing");
      assert.equal(version.note, "waiting_for_allowance");
      const job = () => db(`SELECT status, sent_at FROM processing_jobs WHERE version_id = '${version.id}'`)[0];
      assert.deepEqual(job(), { status: "queued", sent_at: null });
      // Looking again (as the page does) doesn't send it.
      assert.equal((await c.get(`${S}/versions/${version.id}`)).data.version.status, "processing");
      // The owner allows spending this month: the next look sends it.
      const admin = await adminClient(base());
      const put = await admin.req("PUT", "/api/admin/usage", { body: { allowThisMonth: true } });
      assert.equal(put.status, 200, JSON.stringify(put.data));
      assert.equal(put.data.usage.allowed, true);
      assert.equal(put.data.usage.waiting, 1);
      let v;
      for (let i = 0; i < 40 && (!v || v.status === "processing"); i++) v = (await c.get(`${S}/versions/${version.id}`)).data.version;
      assert.equal(v.status, "ready");
      assert.equal(v.note, null);
      assert.ok(job().sent_at);
      assert.equal(db("SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'usage.spending_allowed'")[0].n >= 1, true);
    });
    // Waiting again, a version can be discarded (its job never sent), and the Pac is free for the next one.
    await at(0.96, async () => {
      const { version } = await build(c, products[2].id, caseZip("pack-basic"));
      assert.equal(version.status, "processing");
      const res = await c.post(`${S}/versions/${version.id}/discard`, {});
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(db(`SELECT status FROM processing_jobs WHERE version_id = '${version.id}'`)[0].status, "cancelled");
    });
  });

  test("the daily sweep sends waiting versions once the allowance allows", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "us-sweep");
    let id;
    await at(0.96, async () => {
      id = (await build(c, products[0].id, caseZip("pack-basic"))).version.id;
      assert.equal((await sweep()).waiting, 0, "still paused");
    });
    // A new month (or room again): the sweep sends it.
    const res = await sweep();
    assert.equal(res.waiting, 1);
    let v;
    for (let i = 0; i < 40 && (!v || v.status === "processing"); i++) v = (await c.get(`${S}/versions/${id}`)).data.version;
    assert.equal(v.status, "ready");
  });

  test("creators' uploads stop at the storage cap; AutoStacc's own don't", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "us-cap");
    // Someone else's files fill AutoStacc's storage (a creator's own site files count against their own cap first).
    const { creator: other } = await P.creatorWithProducts(base(), "us-cap-other");
    const admin = await adminClient(base());
    db(`INSERT INTO site_assets (id, creator_id, r2_key, filename, content_type, size_bytes, status, created_at)
      VALUES ('sa_usage_fill', '${other.id}', 'x', 'x.png', 'image/png', 1000000000, 'active', 'x')`);
    try {
      assert.equal((await admin.req("PUT", "/api/admin/usage", { body: { capGb: 1 } })).status, 200);
      const zip = caseZip("pack-basic");
      const made = await P.create(c, products[0].id, zip);
      assert.equal(made.status, 409);
      assert.equal(made.data.error.code, "storage_full");
      const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(2000)]);
      const one = await c.req("PUT", `/api/studio/products/${products[0].id}/files?filename=kick.wav`, { raw: wav, headers: { "Content-Type": "audio/wav" } });
      assert.equal(one.status, 409);
      assert.equal(one.data.error.code, "storage_full");
      // AutoStacc's own Pack Builder isn't held by the cap.
      const own = await admin.post("/api/admin/packs/frayed-signals-samples/versions", { productId: "sample-pack-vol1", filename: "kit.zip", size: zip.length, idempotencyKey: `cap-${Date.now()}-own-upload` });
      assert.notEqual(own.data.error && own.data.error.code, "storage_full", JSON.stringify(own.data));
      if (own.status === 201) await admin.post(`/api/admin/packs/versions/${own.data.version.id}/discard`, {});
    } finally {
      db("DELETE FROM site_assets WHERE id = 'sa_usage_fill'; DELETE FROM store_settings WHERE key = 'storage_cap_gb'");
    }
  });

  test("the cap grows by exactly what active paid plans hold above free storage; the owner's setting stays the base", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "us-paidcap");
    const { creator: payer } = await P.creatorWithProducts(base(), "us-paidcap-payer");
    const { creator: late } = await P.creatorWithProducts(base(), "us-paidcap-late");
    const { creator: small } = await P.creatorWithProducts(base(), "us-paidcap-small");
    const admin = await adminClient(base());
    const usage = async () => (await admin.get("/api/admin/usage")).data.usage;
    const FREE = 550 * 1024 * 1024; // the default free storage (server/creators/policy.js LIMITS)
    const plan = (id, status, capBytes) => db(`INSERT INTO storage_plans (creator_id, status, cap_cents, cap_bytes, started_at, updated_at)
      VALUES ('${id}', '${status}', 500, ${capBytes}, 'x', 'x') ON CONFLICT(creator_id) DO UPDATE SET status = excluded.status, cap_bytes = excluded.cap_bytes`);
    db(`INSERT INTO site_assets (id, creator_id, r2_key, filename, content_type, size_bytes, status, created_at)
      VALUES ('sa_usage_fill3', '${payer.id}', 'x', 'x.png', 'image/png', 1000000000, 'active', 'x')`);
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(2000)]);
    const put = () => c.req("PUT", `/api/studio/products/${products[0].id}/files?filename=kick.wav`, { raw: wav, headers: { "Content-Type": "audio/wav" } });
    try {
      assert.equal((await admin.req("PUT", "/api/admin/usage", { body: { capGb: 1 } })).status, 200);
      const before = await usage();
      assert.deepEqual([before.baseCapBytes, before.capBytes], [1e9, 1e9 + before.paidCapBytes]);
      assert.equal((await put()).data.error.code, "storage_full", "a full 1 GB base");
      // An active plan adds its limit above the creator's free storage; past-due or one under the free storage adds nothing.
      plan(payer.id, "active", FREE + 2e9);
      plan(late.id, "past_due", FREE + 5e9);
      plan(small.id, "active", FREE - 1000);
      const grown = await usage();
      assert.equal(grown.paidCapBytes, before.paidCapBytes + 2e9);
      assert.deepEqual([grown.baseCapBytes, grown.capBytes], [1e9, 1e9 + grown.paidCapBytes], "base + paid = the cap");
      const ok = await put();
      assert.equal(ok.status, 201, `uploads go ahead under the grown cap: ${JSON.stringify(ok.data)}`);
      // Setting the cap changes the base only.
      assert.equal((await admin.req("PUT", "/api/admin/usage", { body: { capGb: 2 } })).status, 200);
      const rebased = await usage();
      assert.deepEqual([rebased.baseCapBytes, rebased.paidCapBytes, rebased.capBytes], [2e9, grown.paidCapBytes, 2e9 + grown.paidCapBytes]);
      // The plan goes past due: its room leaves the cap again.
      plan(payer.id, "past_due", FREE + 2e9);
      assert.equal((await usage()).paidCapBytes, before.paidCapBytes);
    } finally {
      db(`DELETE FROM site_assets WHERE id = 'sa_usage_fill3'; DELETE FROM store_settings WHERE key = 'storage_cap_gb';
        DELETE FROM storage_plans WHERE creator_id IN ('${payer.id}', '${late.id}', '${small.id}')`);
    }
  });

  test("at import, unpacked files past the cap fail the version (storage_full)", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "us-capimport");
    const { creator: other } = await P.creatorWithProducts(base(), "us-capimport-other");
    const admin = await adminClient(base());
    const zip = caseZip("pack-basic");
    const stored = (await admin.get("/api/admin/usage")).data.usage.meters.r2_bytes.used;
    // Room for the archive (27 KB) but not for what it unpacks to (1.2 MB).
    db(`INSERT INTO site_assets (id, creator_id, r2_key, filename, content_type, size_bytes, status, created_at)
      VALUES ('sa_usage_fill2', '${other.id}', 'x', 'x.png', 'image/png', ${1e9 - stored - zip.length - 1000}, 'active', 'x')`);
    try {
      assert.equal((await admin.req("PUT", "/api/admin/usage", { body: { capGb: 1 } })).status, 200);
      const { version } = await build(c, products[0].id, zip);
      assert.equal(version.status, "failed", JSON.stringify(version));
      assert.equal(version.note, "storage_full");
    } finally {
      db("DELETE FROM site_assets WHERE id = 'sa_usage_fill2'; DELETE FROM store_settings WHERE key = 'storage_cap_gb'");
    }
  });

  test("a deleted file holds its creator's room until its bytes are deleted a day later", async () => {
    const { c, creator, products } = await P.creatorWithProducts(base(), "us-purge");
    db(`UPDATE creators SET files_quota_bytes = 10000 WHERE id = '${creator.id}'`);
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(6000)]);
    const put = () => c.req("PUT", `/api/studio/products/${products[0].id}/files?filename=kick.wav`, { raw: wav, headers: { "Content-Type": "audio/wav" } });
    const first = await put();
    assert.equal(first.status, 201, JSON.stringify(first.data));
    assert.equal((await c.req("DELETE", `/api/studio/products/${products[0].id}/files/${first.data.file.id}`)).status, 200);
    assert.equal((await put()).data.error.code, "quota_exceeded", "deleting and uploading again can't fill storage");
    // Not before its day is up; and a file removed before removal times were kept (no removed_at) is never purged.
    const removed = db(`SELECT removed_at FROM product_files WHERE id = '${first.data.file.id}'`)[0].removed_at;
    assert.ok(removed);
    db(`INSERT INTO product_files (id, product_id, r2_key, filename, label, content_type, size_bytes, sort, active, created_at, kind, status, status_at)
      SELECT 'pf_oldremoved', product_id, 'files/old/kept.wav', 'kept.wav', '', content_type, 10, 99, 0, '2000-01-01T00:00:00.000Z', kind, 'deleted', '2000-01-01T00:00:00.000Z'
      FROM product_files WHERE id = '${first.data.file.id}'`);
    await sweep();
    assert.equal(JSON.parse(db(`SELECT meta FROM product_files WHERE id = '${first.data.file.id}'`)[0].meta || "{}").purgedAt, undefined, "kept for its day");
    db(`UPDATE product_files SET removed_at = '2000-01-01T00:00:00.000Z' WHERE id = '${first.data.file.id}'`);
    assert.ok((await sweep()).purgedFiles >= 1);
    assert.equal(db("SELECT meta FROM product_files WHERE id = 'pf_oldremoved'")[0].meta, null, "removed before removal times: kept");
    db("DELETE FROM product_files WHERE id = 'pf_oldremoved'");
    assert.ok(JSON.parse(db(`SELECT meta FROM product_files WHERE id = '${first.data.file.id}'`)[0].meta).purgedAt);
    assert.equal((await put()).status, 201, "the room is back once the bytes are gone");
  });

  test("a waiting job whose version went away never blocks the line", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "us-orphan", 2);
    let second, a;
    await at(0.96, async () => {
      a = (await build(c, products[0].id, caseZip("pack-basic"))).version;
      second = (await build(c, products[1].id, caseZip("pack-basic"))).version;
      // As if a discard had raced the start: the version ended, its job still waits first in line.
      db(`UPDATE pac_versions SET status = 'discarded' WHERE id = '${a.id}'`);
    });
    const res = await sweep();
    assert.ok(res.waiting >= 1, JSON.stringify(res));
    assert.equal(db(`SELECT status FROM processing_jobs WHERE version_id = '${a.id}'`)[0].status, "cancelled");
    let v;
    for (let i = 0; i < 40 && (!v || v.status === "processing"); i++) v = (await c.get(`${S}/versions/${second.id}`)).data.version;
    assert.equal(v.status, "ready");
  });

  test("admin only; bad input refused", async () => {
    const anon = new Client(base());
    assert.equal((await anon.get("/api/admin/usage")).status, 404);
    const admin = await adminClient(base());
    const got = await admin.get("/api/admin/usage");
    assert.equal(got.status, 200);
    assert.deepEqual(Object.keys(got.data.usage.meters).sort(), ["class_a", "container_ms", "r2_bytes"]);
    for (const body of [{}, { allowThisMonth: "yes" }, { capGb: 0 }, { capGb: 1.5 }, { capGb: "9" }, { allowThisMonth: true, capGb: 0 }]) {
      assert.equal((await admin.req("PUT", "/api/admin/usage", { body })).status, 400, JSON.stringify(body));
    }
    assert.equal((await admin.get("/api/admin/usage")).data.usage.allowed, false, "a refused change saves nothing");
  });
});

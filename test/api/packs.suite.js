// Pack Builder (docs/packs.md, Phase 3): an admin uploads a Pac's ZIP in parts, the engine checks it and stores each
// original through the storage relay, the admin publishes, and a buyer downloads the very bytes that were uploaded.
// Also: the routes are invisible to everyone else, uploads keep to their plan, a damaged or wrong archive never
// reaches customers, a failed or discarded version leaves the Pac free, and the engine can't write outside its job.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Client, ROOT, unique } from "../support/client.js";
import { newBuyer, mockBuy, adminClient } from "../support/flows.js";
import { entries as zipEntries } from "../mock-engine/server.js";

const CASES = path.join(ROOT, "engine/conformance/cases");
const EXPECTED = path.join(ROOT, "engine/conformance/expected");
const caseZip = (name) => fs.readFileSync(path.join(CASES, `${name}.zip`));
const expected = (name) => JSON.parse(fs.readFileSync(path.join(EXPECTED, `${name}.suggest.json`), "utf8"));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const PRODUCT = "sample-pack-vol1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default (ctx) => describe("packs", () => {
  const base = () => ctx.mock.url;

  // Creates a version for a Pac, uploads the archive as one part, completes it and waits until processing ends.
  async function build(admin, pac, zip, { complete = true } = {}) {
    const created = await admin.post(`/api/admin/packs/${pac}/versions`, { productId: PRODUCT, filename: "pack.zip", size: zip.length, idempotencyKey: crypto.randomUUID() });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const { version, upload } = created.data;
    const put = await admin.send("PUT", `/api/admin/packs/uploads/${upload.uploadId}/parts/1`, { raw: zip, headers: { "Content-Type": "application/octet-stream" } });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    if (!complete) return { version, upload };
    const done = await admin.post(`/api/admin/packs/uploads/${upload.uploadId}/complete`, {});
    assert.equal(done.status, 200, JSON.stringify(done.data));
    let v = done.data.version;
    for (let i = 0; i < 60 && v.status === "processing"; i++) {
      await wait(250);
      v = (await admin.get(`/api/admin/packs/versions/${version.id}`)).data.version;
    }
    return { version: v, upload };
  }

  test("everyone but an admin gets 404 from every Pack Builder route", async () => {
    const { c } = await newBuyer(base(), "packs-customer");
    for (const client of [new Client(base()), c]) {
      assert.equal((await client.post("/api/admin/packs/frayed-signals-samples/versions", {})).status, 404);
      assert.equal((await client.get("/api/admin/packs/versions/pv_aaaaaaaaaaaaaaaa")).status, 404);
      assert.equal((await client.post("/api/admin/packs/versions/pv_aaaaaaaaaaaaaaaa/publish", {})).status, 404);
      assert.equal((await client.post("/api/admin/packs/uploads/up_aaaaaaaaaaaaaaaa/complete", {})).status, 404);
    }
  });

  test("upload → check → publish → a buyer downloads exactly the uploaded bytes, in their folders", async () => {
    const admin = await adminClient(base());
    const { version } = await build(admin, "frayed-signals-samples", caseZip("pack-basic"));
    assert.equal(version.status, "ready", JSON.stringify(version));
    const want = expected("pack-basic").files.filter((f) => f.sha256 && !f.ignored);
    assert.equal(version.stats.files, want.length);
    assert.equal(version.stats.ignored, 2, "macOS clutter is ignored");
    assert.deepEqual(version.files.map((f) => f.sha256).sort(), want.map((f) => f.sha256).sort());
    const kick = version.files.find((f) => f.filename === "Kick 01.wav");
    assert.ok(kick.suggestions.some((s) => s.field === "instrument" && s.value === "kick"), "suggestions reach the builder");

    const pub = await admin.post(`/api/admin/packs/versions/${version.id}/publish`, {});
    assert.equal(pub.status, 200, JSON.stringify(pub.data));
    assert.equal(pub.data.version.status, "published");
    assert.equal((await admin.post(`/api/admin/packs/versions/${version.id}/publish`, {})).status, 409, "publishing twice is refused");

    const { c } = await newBuyer(base(), "packs-buyer");
    await mockBuy(c, [{ productId: PRODUCT }]);
    const lib = await c.get("/api/library");
    const all = lib.data.items.find((p) => p.productId === PRODUCT).files;
    const names = new Set(version.files.map((f) => f.filename));
    const files = all.filter((f) => names.has(f.filename));
    assert.equal(files.length, want.length);
    assert.ok(files.every((f) => f.pacId === "frayed-signals-samples"));
    assert.ok(all.length > files.length, "files uploaded before Pack Builder stay delivered");
    const kickFile = files.find((f) => f.filename === "Kick 01.wav");
    assert.equal(kickFile.folderPath, "Drums/Kicks", "the wrapper folder is dropped, the rest kept");
    assert.equal(kickFile.kind, "one-shots");
    for (const f of files) {
      const link = await c.post("/api/downloads", { fileId: f.id });
      assert.equal(link.status, 200);
      const res = await fetch(base() + link.data.url, { headers: { Cookie: c.cookieHeader(), "cf-connecting-ip": c.ip } });
      assert.equal(res.status, 200, f.filename);
      const body = Buffer.from(await res.arrayBuffer());
      assert.ok(want.some((w) => w.sha256 === sha(body) && w.path.endsWith(`/${f.filename}`)), `${f.filename} is byte-identical`);
    }
  });

  test("a whole folder or Pac downloads as one ZIP of the original bytes, only for its owner", async () => {
    const { c } = await newBuyer(base(), "packs-bundle");
    await mockBuy(c, [{ productId: PRODUCT }]);
    const files = (await c.get("/api/library")).data.items.find((p) => p.productId === PRODUCT).files;
    const packFiles = files.filter((f) => f.folderPath !== undefined && f.pacId === "frayed-signals-samples" && f.kind !== "");
    const legacy = files.find((f) => !packFiles.includes(f) && !f.folderPath);
    const want = expected("pack-basic").files.filter((f) => f.sha256 && !f.ignored);
    const ids = files.filter((f) => want.some((w) => w.path.endsWith(`/${f.filename}`))).map((f) => f.id);
    const made = await c.post("/api/downloads/bundle", { fileIds: ids });
    assert.equal(made.status, 200, JSON.stringify(made.data));
    assert.equal(made.data.files, ids.length);
    const res = await fetch(base() + made.data.url, { headers: { Cookie: c.cookieHeader(), "cf-connecting-ip": c.ip } });
    assert.equal(res.status, 200);
    const zip = Buffer.from(await res.arrayBuffer());
    assert.equal(Number(res.headers.get("content-length")), zip.length);
    const inside = zipEntries(zip);
    assert.ok(inside.has("Drums/Kicks/Kick 01.wav"), [...inside.keys()].join(", "));
    for (const [name, read] of inside) assert.ok(want.some((w) => w.path.endsWith(name) && w.sha256 === sha(read())), `${name} is byte-identical`);
    // Someone else can't use the link, nor make one for files they don't own.
    const other = await newBuyer(base(), "packs-bundle-other");
    const stolen = await fetch(base() + made.data.url, { headers: { Cookie: other.c.cookieHeader(), "cf-connecting-ip": other.c.ip }, redirect: "manual" });
    assert.equal(stolen.status, 303);
    assert.match(stolen.headers.get("location"), /download=denied/);
    assert.equal((await other.c.post("/api/downloads/bundle", { fileIds: ids })).status, 403);
    assert.equal((await new Client(base()).post("/api/downloads/bundle", { fileIds: ids })).status, 401);
    // Files from before Pack Builder (no checksum on record) download one at a time.
    if (legacy) assert.equal((await c.post("/api/downloads/bundle", { fileIds: [ids[0], legacy.id] })).data.error.code, "not_bundleable");
    for (const bad of [[], ["pf_AAAA"], Array.from({ length: 2001 }, (_, i) => `pf_${"a".repeat(10)}${i}`), "pf_x"]) {
      assert.equal((await c.post("/api/downloads/bundle", { fileIds: bad })).status, 400);
    }
    // A forged or tampered link fails.
    const [body, sig] = made.data.url.split("/").pop().split(".");
    for (const t of [`${body}.${sig.slice(0, -2)}aa`, `${body}x.${sig}`, "nonsense"]) {
      const r = await fetch(`${base()}/api/downloads/bundle/${t}`, { headers: { Cookie: c.cookieHeader(), "cf-connecting-ip": c.ip }, redirect: "manual" });
      assert.equal(r.status, 303, t);
    }
  });

  test("a new version replaces the files: earlier buyers keep the old ones for now, new buyers only get the new", async () => {
    const admin = await adminClient(base());
    const early = await newBuyer(base(), "packs-early");
    await mockBuy(early.c, [{ productId: PRODUCT }]);
    const before = (await early.c.get("/api/library")).data.items.find((p) => p.productId === PRODUCT).files.filter((f) => f.pacId === "frayed-signals-samples" && f.folderPath);
    assert.ok(before.length > 0);
    const { version, upload } = await build(admin, "frayed-signals-samples", caseZip("pack-names"));
    assert.equal(version.status, "ready");
    const again = await admin.post(`/api/admin/packs/uploads/${upload.uploadId}/complete`, {});
    assert.equal(again.status, 200, "completing twice is harmless");
    assert.equal((await admin.post(`/api/admin/packs/versions/${version.id}/publish`, {})).status, 200);
    const overview = (await admin.get("/api/admin/packs/frayed-signals-samples")).data;
    assert.equal(overview.pac.liveVersionId, version.id);
    assert.equal(overview.versions.filter((v) => v.status === "published").length, 1, "the earlier version is superseded");

    const late = await newBuyer(base(), "packs-late");
    await mockBuy(late.c, [{ productId: PRODUCT }]);
    const lateFiles = (await late.c.get("/api/library")).data.items.find((p) => p.productId === PRODUCT).files;
    assert.ok(lateFiles.every((f) => !f.retiredAt), "a new buyer sees only current files");
    assert.ok(!lateFiles.some((f) => before.some((b) => b.id === f.id)));
    assert.equal((await late.c.post("/api/downloads", { fileId: before[0].id })).status, 403, "nor can they download a retired one");
    assert.equal((await late.c.post("/api/downloads/bundle", { fileIds: [before[0].id] })).status, 403);

    const earlyFiles = (await early.c.get("/api/library")).data.items.find((p) => p.productId === PRODUCT).files;
    const kept = earlyFiles.filter((f) => before.some((b) => b.id === f.id));
    assert.equal(kept.length, before.length, "an earlier buyer still has the replaced files");
    assert.ok(kept.every((f) => f.retiredAt));
    assert.equal((await early.c.post("/api/downloads", { fileId: before[0].id })).status, 200);
  });

  test("one version in progress per Pac; the same idempotency key returns the same version", async () => {
    const admin = await adminClient(base());
    const zip = caseZip("pack-names");
    const key = crypto.randomUUID();
    const body = { productId: PRODUCT, filename: "names.zip", size: zip.length, idempotencyKey: key };
    const a = await admin.post("/api/admin/packs/frayed-signals-loops/versions", body);
    const b = await admin.post("/api/admin/packs/frayed-signals-loops/versions", body);
    assert.equal(a.status, 201);
    assert.equal(b.status, 200);
    assert.equal(b.data.version.id, a.data.version.id);
    const other = await admin.post("/api/admin/packs/frayed-signals-loops/versions", { ...body, idempotencyKey: crypto.randomUUID() });
    assert.equal(other.status, 409);
    assert.equal(other.data.error.code, "draft_exists");
    // Parts must match the plan; completing with a part missing lists it.
    const up = a.data.upload.uploadId;
    assert.equal((await admin.send("PUT", `/api/admin/packs/uploads/${up}/parts/2`, { raw: zip })).status, 400);
    assert.equal((await admin.send("PUT", `/api/admin/packs/uploads/${up}/parts/1`, { raw: zip.subarray(1) })).status, 400);
    const missing = await admin.post(`/api/admin/packs/uploads/${up}/complete`, {});
    assert.equal(missing.status, 409);
    assert.deepEqual(missing.data.missing, [1]);
    // Discarding frees the Pac.
    assert.equal((await admin.post(`/api/admin/packs/versions/${a.data.version.id}/discard`, {})).status, 200);
    assert.equal((await admin.post("/api/admin/packs/frayed-signals-loops/versions", { ...body, idempotencyKey: crypto.randomUUID() })).status, 201);
    const again = (await admin.get(`/api/admin/packs/versions/${a.data.version.id}`)).data.version;
    assert.equal(again.status, "discarded");
  });

  test("damaged and deceptive files never reach customers; a version with nothing left can't be published", async () => {
    const admin = await adminClient(base());
    await clearDraft(admin, "frayed-signals-loops");
    const { version } = await build(admin, "frayed-signals-loops", caseZip("deceptive-and-damaged"));
    assert.equal(version.status, "ready");
    assert.equal(version.stats.files, 0);
    assert.ok(version.stats.refused.length >= 2);
    assert.equal((await admin.post(`/api/admin/packs/versions/${version.id}/publish`, {})).data.error.code, "nothing_to_publish");
    assert.equal((await admin.post(`/api/admin/packs/versions/${version.id}/discard`, {})).status, 200);
  });

  test("something that isn't a ZIP fails the version and frees the Pac", async () => {
    const admin = await adminClient(base());
    await clearDraft(admin, "frayed-signals-loops");
    const { version } = await build(admin, "frayed-signals-loops", caseZip("not-a-zip"));
    assert.equal(version.status, "failed");
    assert.equal(version.note, "not_zip");
    const next = await admin.post("/api/admin/packs/frayed-signals-loops/versions", { productId: PRODUCT, filename: "x.zip", size: 100, idempotencyKey: crypto.randomUUID() });
    assert.equal(next.status, 201);
    await admin.post(`/api/admin/packs/versions/${next.data.version.id}/discard`, {});
  });

  test("the engine's storage relay refuses writes outside a running job's prefix", async () => {
    const put = (key) => fetch(`${base()}/api/internal/engine-storage/autostacc-files/${key}`, { method: "PUT", body: "x", headers: { "Content-Length": "1" } });
    for (const key of ["products/x/evil.wav", "blobs/autostacc/pj_nothing/1/1", "uploads/x.zip"]) assert.equal((await put(key)).status, 403, key);
    assert.equal((await fetch(`${base()}/api/internal/engine-storage/autostacc-previews/x`)).status, 403, "other buckets");
  });

  // Discards whatever version a Pac still has in progress (tests share one store).
  async function clearDraft(admin, pac) {
    const { data } = await admin.get(`/api/admin/packs/${pac}`);
    if (data.pac.draftVersionId) assert.equal((await admin.post(`/api/admin/packs/versions/${data.pac.draftVersionId}/discard`, {})).status, 200);
  }
});

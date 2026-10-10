// Platform layer on top of the store (docs/architecture.md): projects and follows, Auto-Stacc (free only, never
// paid, never twice), the library's Project/Pac/kind fields with downloads still guarded per product, admin uploads
// tagged with a Pac, and generic polls (one vote per verified account, per-project opt-in, closed polls, origins).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, unique, sql } from "../support/client.js";
import { newBuyer, mockBuy, adminClient } from "../support/flows.js";

export default (ctx) => describe("platform", () => {
  test("projects are listed with features; follows only for verified accounts", async () => {
    const anon = new Client(ctx.mock.url);
    const list = await anon.get("/api/projects");
    assert.equal(list.status, 200);
    assert.equal(list.data.follows, null);
    assert.equal(list.data.signedIn, false);
    assert.ok(list.data.projects.some((p) => p.id === "glitches-and-stitches" && p.features.includes("polls")));
    assert.equal((await anon.req("PUT", "/api/follows/glitches-and-stitches", { body: { autoStacc: true } })).status, 401);
    // Signed up but not confirmed: no session, no follow.
    const pending = new Client(ctx.mock.url);
    await pending.post("/api/auth/sign-up/email", { email: unique("unconfirmed"), password: "correct-horse-battery", name: "x" });
    assert.ok([401, 403].includes((await pending.req("PUT", "/api/follows/glitches-and-stitches", { body: {} })).status));
  });

  test("Stacclets and Pacs from data/ are in the database with their project; drafts unpublished", async () => {
    const pacs = sql(ctx.mock.stateDir, "SELECT id, stacclet_id, project_id, source, published FROM pacs WHERE deleted_at IS NULL ORDER BY id");
    const midi = pacs.find((p) => p.id === "frayed-signals-midi");
    assert.ok(midi, "a Pac from data/pacs.js is synced");
    assert.deepEqual([midi.stacclet_id, midi.project_id, midi.source, midi.published], ["frayed-signals", "glitches-and-stitches", "catalog", 0]);
    const st = sql(ctx.mock.stateDir, "SELECT project_id, source FROM stacclets WHERE id = 'frayed-signals'")[0];
    assert.deepEqual([st.project_id, st.source], ["glitches-and-stitches", "catalog"]);
  });

  test("follow, change Auto-Stacc, unfollow; bad input and unknown projects fail closed", async () => {
    const { c } = await newBuyer(ctx.mock.url, "follower");
    assert.equal((await c.req("PUT", "/api/follows/no-such-project", { body: {} })).status, 404);
    assert.equal((await c.req("PUT", "/api/follows/glitches-and-stitches", { body: { autoStacc: "yes" } })).status, 400);
    assert.equal((await c.req("PUT", "/api/follows/..%2Fadmin", { body: {} })).status, 400);
    const f = await c.req("PUT", "/api/follows/dev-other", { body: {} });
    assert.equal(f.status, 200);
    assert.deepEqual(f.data.follow, { projectId: "dev-other", autoStacc: false });
    assert.deepEqual((await c.get("/api/projects")).data.follows.map((x) => [x.projectId, x.autoStacc]), [["dev-other", false]]);
    assert.equal((await c.req("DELETE", "/api/follows/dev-other")).status, 200);
    assert.deepEqual((await c.get("/api/projects")).data.follows, []);
    // A follow from another site is refused like every other state change.
    const evil = new Client(ctx.mock.url, { origin: "https://evil.example" });
    evil.jar = c.jar;
    assert.equal((await evil.req("PUT", "/api/follows/dev-other", { body: {} })).status, 403);
  });

  test("Auto-Stacc adds the project's free products, never paid ones, once, and stays after unfollowing", async () => {
    const { c, user } = await newBuyer(ctx.mock.url, "autostacc");
    const on = await c.req("PUT", "/api/follows/glitches-and-stitches", { body: { autoStacc: true } });
    assert.equal(on.status, 200);
    assert.equal(on.data.staccd, 1);
    const lib = (await c.get("/api/library")).data.items;
    assert.deepEqual(lib.map((i) => [i.productId, i.sources]), [["dev-free", ["auto"]]]);
    // Re-following and reopening the library never duplicates the grant.
    assert.equal((await c.req("PUT", "/api/follows/glitches-and-stitches", { body: { autoStacc: true } })).data.staccd, 0);
    await c.get("/api/library");
    const rows = sql(ctx.mock.stateDir, `SELECT product_id, source_type, note FROM entitlements WHERE email = '${user.email}'`);
    assert.deepEqual(rows, [{ product_id: "dev-free", source_type: "free", note: "auto-stacc" }]);
    // Following without Auto-Stacc grants nothing; unfollowing keeps what was added.
    const { c: other } = await newBuyer(ctx.mock.url, "noauto");
    assert.equal((await other.req("PUT", "/api/follows/glitches-and-stitches", { body: { autoStacc: false } })).data.staccd, 0);
    assert.deepEqual((await other.get("/api/library")).data.items, []);
    await c.req("DELETE", "/api/follows/glitches-and-stitches");
    assert.deepEqual((await c.get("/api/library")).data.items.map((i) => i.productId), ["dev-free"]);
  });

  test("the library tags owned files with project, Pac and kind; downloads are still checked per product", async () => {
    const { c } = await newBuyer(ctx.mock.url, "stacc");
    await mockBuy(c, [{ productId: "sample-pack-vol1" }]);
    const [item] = (await c.get("/api/library")).data.items;
    assert.equal(item.projectId, "glitches-and-stitches");
    assert.deepEqual(item.pacs, ["frayed-signals-samples", "frayed-signals-loops"]);
    const [file] = item.files;
    assert.equal(file.pacId, "frayed-signals-samples");
    assert.equal(file.kind, "samples");
    assert.equal(file.r2_key, undefined);
    assert.equal((await c.post("/api/downloads", { fileId: file.id })).status, 200);
    // Same Project and Pac, different product: not owned, not downloadable.
    const { c: stranger } = await newBuyer(ctx.mock.url, "stranger");
    assert.equal((await stranger.post("/api/downloads", { fileId: file.id })).status, 403);
    assert.equal((await c.post("/api/downloads", { fileId: ctx.fileIdFor("stems-patchwork") })).status, 403);
    // The public catalog names each product's project.
    assert.ok((await c.get("/api/products")).data.products.every((p) => p.projectId === "glitches-and-stitches"));
  });

  test("admin uploads can name one of the product's Pacs and a content kind, nothing else", async () => {
    const admin = await adminClient(ctx.mock.url);
    const put = (q) => admin.req("PUT", `/api/admin/products/sample-pack-vol1/files?filename=Kick%2001.wav&${q}`, { raw: Buffer.from("RIFF\u0000\u0000\u0000\u0000WAVEfmt ", "latin1"), headers: { "Content-Type": "audio/wav" } });
    assert.equal((await put("pac=frayed-signals-midi")).data.error.code, "invalid_pac");
    assert.equal((await put("pac=serum-presets")).status, 400);
    assert.equal((await put("kind=Bad%20Kind")).status, 400);
    const ok = await put("pac=frayed-signals-loops&kind=loops");
    assert.equal(ok.status, 201);
    const product = (await admin.get("/api/admin/products")).data.products.find((p) => p.id === "sample-pack-vol1");
    assert.ok(product.files.some((f) => f.id === ok.data.fileId && f.pac_id === "frayed-signals-loops" && f.kind === "loops"));
    assert.deepEqual(product.pacs, ["frayed-signals-samples", "frayed-signals-loops"]);
    // A product without Pacs takes no Pac.
    const none = await admin.req("PUT", "/api/admin/products/wallpapers/files?filename=a.png&pac=frayed-signals-loops", { raw: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), headers: { "Content-Type": "image/png" } });
    assert.equal(none.status, 400);
  });

  test("polls: read with tally, one changeable vote per verified account", async () => {
    const anon = new Client(ctx.mock.url);
    const read = await anon.get("/api/polls/dev-poll");
    assert.equal(read.status, 200);
    assert.equal(read.data.open, true);
    assert.equal(read.data.myVote, null);
    assert.equal(read.data.signedIn, false);
    assert.deepEqual(read.data.options.map((o) => o.id), ["finish-it", "scrap-it"]);
    assert.equal((await anon.post("/api/polls/dev-poll/vote", { optionId: "finish-it" })).status, 401);

    const { c, user } = await newBuyer(ctx.mock.url, "voter");
    assert.equal((await c.get("/api/polls/dev-poll")).data.signedIn, true);
    const before = read.data.total;
    const v1 = await c.post("/api/polls/dev-poll/vote", { optionId: "finish-it" });
    assert.equal(v1.status, 200);
    assert.equal(v1.data.total, before + 1);
    const v2 = await c.post("/api/polls/dev-poll/vote", { optionId: "scrap-it", votes: 1000 });
    assert.equal(v2.data.total, before + 1, "changing a vote doesn't add one");
    assert.equal((await c.get("/api/polls/dev-poll")).data.myVote, "scrap-it");
    assert.deepEqual(sql(ctx.mock.stateDir, `SELECT option_id FROM poll_votes WHERE poll_id = 'dev-poll' AND user_id = '${user.id}'`), [{ option_id: "scrap-it" }]);
  });

  test("polls fail closed: bad options, closed polls, projects without polls, unknown ids, other origins", async () => {
    const { c } = await newBuyer(ctx.mock.url, "badvoter");
    assert.equal((await c.post("/api/polls/dev-poll/vote", { optionId: "rig-it" })).data.error.code, "invalid_option");
    assert.equal((await c.post("/api/polls/dev-poll/vote", { optionId: ["finish-it"] })).status, 400);
    const closed = await c.post("/api/polls/dev-closed-poll/vote", { optionId: "finish-it" });
    assert.equal(closed.status, 409);
    assert.equal(closed.data.error.code, "poll_closed");
    assert.equal((await c.get("/api/polls/dev-closed-poll")).data.open, false);
    // dev-other doesn't list "polls" in its features: its poll doesn't exist as far as anyone can tell.
    assert.equal((await c.get("/api/polls/dev-other-poll")).status, 404);
    assert.equal((await c.post("/api/polls/dev-other-poll/vote", { optionId: "finish-it" })).status, 404);
    assert.equal((await c.get("/api/polls/no-such-poll")).status, 404);
    const evil = new Client(ctx.mock.url, { origin: "https://evil.example" });
    evil.jar = c.jar;
    assert.equal((await evil.post("/api/polls/dev-poll/vote", { optionId: "finish-it" })).status, 403);
  });
});

// Downloads: every way to reach a paid file without owning it must fail (no login, no entitlement, someone else's
// file or link, edited ids, forged or expired links, guessed paths, unpublished products, revoked access).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Client, devVar, unique } from "../support/client.js";
import { newBuyer, mockBuy, mockOutcome, adminClient } from "../support/flows.js";

const b64 = (s) => Buffer.from(s).toString("base64url");
function forge(payload, secret) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${crypto.createHmac("sha256", secret).update("dl1." + body).digest("base64url")}`;
}

export default (ctx) => describe("downloads", () => {
  const fileOf = (id) => ctx.fileIdFor(id);
  const issue = (c, fileId) => c.post("/api/downloads", { fileId });

  test("an owner gets a short-lived private link that serves the file", async () => {
    const { c } = await newBuyer(ctx.mock.url, "dl-owner");
    await mockBuy(c, [{ productId: "serum-presets" }]);
    const r = await issue(c, fileOf("serum-presets"));
    assert.equal(r.status, 200);
    assert.ok(Date.parse(r.data.expiresAt) - Date.now() <= 5 * 60 * 1000 + 2000);
    const file = await c.get(r.data.url);
    assert.equal(file.status, 200);
    assert.match(file.data, /Test download for serum-presets/);
    assert.match(file.headers.get("content-disposition"), /^attachment/);
    assert.match(file.headers.get("cache-control"), /no-store/);
  });

  test("no login, no entitlement, someone else's file: denied", async () => {
    const owner = await newBuyer(ctx.mock.url, "dl-a");
    await mockBuy(owner.c, [{ productId: "sample-pack-vol1" }]);
    const other = await newBuyer(ctx.mock.url, "dl-b");
    assert.equal((await issue(new Client(ctx.mock.url), fileOf("sample-pack-vol1"))).status, 401);
    assert.equal((await issue(other.c, fileOf("sample-pack-vol1"))).status, 403);
    // Edited and invented file ids.
    for (const fileId of [fileOf("dev-unpublished"), fileOf("vj-loops"), "pf_aaaaaaaaaaaaaaaa"]) assert.equal((await issue(owner.c, fileId)).status, 403, fileId);
    for (const fileId of ["../products/x", "pf_AAAA", 12, null]) assert.equal((await issue(owner.c, fileId)).status, 400, String(fileId));
  });

  test("a link copied to another person doesn't work for them", async () => {
    const owner = await newBuyer(ctx.mock.url, "dl-share");
    await mockBuy(owner.c, [{ productId: "stems-patchwork" }]);
    const link = (await issue(owner.c, fileOf("stems-patchwork"))).data.url;
    const thief = await newBuyer(ctx.mock.url, "dl-thief");
    for (const c of [new Client(ctx.mock.url), thief.c]) {
      const r = await c.get(link);
      assert.equal(r.status, 303);
      assert.equal(r.headers.get("location"), "/library?download=denied");
    }
  });

  test("edited, forged and expired links fail", async () => {
    const { c, user } = await newBuyer(ctx.mock.url, "dl-forge");
    await mockBuy(c, [{ productId: "wallpapers" }]);
    const link = (await issue(c, fileOf("wallpapers"))).data.url;
    const token = link.split("/").pop();
    const [body, sig] = token.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    // Point the signed link at a file this user doesn't own, keeping the old signature.
    const edited = `${b64(JSON.stringify({ ...payload, f: fileOf("vj-loops") }))}.${sig}`;
    assert.equal((await c.get(`/api/downloads/${edited}`)).headers.get("location"), "/library?download=denied");
    // Signed with a guessed key.
    assert.equal((await c.get(`/api/downloads/${forge({ ...payload, f: fileOf("vj-loops") }, "guessed-secret")}`)).headers.get("location"), "/library?download=denied");
    // Correctly signed but expired (the test knows the local dev secret).
    const expired = forge({ ...payload, x: Math.floor(Date.now() / 1000) - 10 }, devVar("DOWNLOAD_SIGNING_SECRET"));
    assert.equal((await c.get(`/api/downloads/${expired}`)).headers.get("location"), "/library?download=expired");
    // Correctly signed for a file of another product than the entitlement: still denied.
    const crossed = forge({ ...payload, f: fileOf("vj-loops") }, devVar("DOWNLOAD_SIGNING_SECRET"));
    assert.equal((await c.get(`/api/downloads/${crossed}`)).headers.get("location"), "/library?download=denied");
    // Correctly signed with another person's entitlement id.
    const other = await newBuyer(ctx.mock.url, "dl-victim");
    await mockBuy(other.c, [{ productId: "vj-loops" }]);
    const victimEnt = (await other.c.get("/api/library")).data.items[0].entitlementId;
    const stolen = forge({ f: fileOf("vj-loops"), e: victimEnt, s: `u:${user.id}`, x: Math.floor(Date.now() / 1000) + 60 }, devVar("DOWNLOAD_SIGNING_SECRET"));
    assert.equal((await c.get(`/api/downloads/${stolen}`)).headers.get("location"), "/library?download=denied");
    // Garbage.
    for (const t of ["x", "a.b.c", "....", "%00", "eyJ.eyJ"]) assert.equal((await c.get(`/api/downloads/${t}`)).status, 303, t);
  });

  test("guessed storage paths go nowhere", async () => {
    const { c } = await newBuyer(ctx.mock.url, "dl-guess");
    for (const p of ["/api/downloads/dev/wallpapers/readme.txt", "/dev/wallpapers/readme.txt", "/media/previews/../dev/wallpapers/readme.txt",
      "/media/previews/readme.txt", "/api/files/dev/wallpapers/readme.txt", "/products/wallpapers"]) {
      const r = await c.get(p);
      assert.ok([303, 404].includes(r.status), `${p} -> ${r.status}`);
      assert.doesNotMatch(String(r.data), /Test download/);
    }
  });

  test("a refund takes the files away, including links already issued", async () => {
    const { c } = await newBuyer(ctx.mock.url, "dl-refund");
    const order = await mockBuy(c, [{ productId: "ep-corrupted-thread" }]);
    const link = (await issue(c, fileOf("ep-corrupted-thread"))).data.url;
    assert.equal((await mockOutcome(c, order, "refunded")).data.outcome, "refunded");
    assert.equal((await c.get(link)).headers.get("location"), "/library?download=denied");
    assert.equal((await issue(c, fileOf("ep-corrupted-thread"))).status, 403);
  });

  test("owners keep their files when a product is later paused", async () => {
    const { c } = await newBuyer(ctx.mock.url, "dl-paused");
    await mockBuy(c, [{ productId: "stems-patchwork" }]);
    const admin = await adminClient(ctx.mock.url);
    await admin.req("PATCH", "/api/admin/products/stems-patchwork", { body: { salesPaused: true } });
    assert.equal((await issue(c, fileOf("stems-patchwork"))).status, 200);
    assert.equal((await new Client(ctx.mock.url).post("/api/checkout", { email: unique("late"), items: [{ productId: "stems-patchwork" }] })).status, 409);
    await admin.req("PATCH", "/api/admin/products/stems-patchwork", { body: { salesPaused: false } });
  });

  test("hammering download links is rate limited", async () => {
    const c = new Client(ctx.mock.url);
    const codes = [];
    for (let i = 0; i < 70; i++) codes.push((await c.get(`/api/downloads/garbage${i}.x`)).status);
    assert.ok(codes.includes(429), codes.slice(-5).join(","));
  });
});

// Emails people opt into (server/admin/news.js): AutoStacc news goes only to verified accounts that switched it on, once
// per issue however often it's sent; new-release mail only to followers who want it, once per product; admins only.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { outbox } from "../support/client.js";
import { newBuyer, adminClient } from "../support/flows.js";

export default (ctx) => describe("notifications", () => {
  const mails = async (to, kind) => (await outbox(ctx.mock.url, to)).filter((m) => m.kind === kind);
  const sendAll = async (admin, path, body) => {
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const r = await admin.post(path, body);
      assert.equal(r.status, 200, JSON.stringify(r.data));
      total += r.data.sent;
      if (!r.data.left) return total;
    }
    throw new Error("never finished");
  };

  test("AutoStacc news: a test to the admin, then each subscriber once; nobody else; admins only", async () => {
    const admin = await adminClient(ctx.mock.url);
    const { c: on, user: onUser } = await newBuyer(ctx.mock.url, "news-on");
    const { user: offUser } = await newBuyer(ctx.mock.url, "news-off");
    assert.equal((await on.req("PUT", "/api/account/email-preferences", { body: { platformNews: true } })).status, 200);
    assert.equal((await on.get("/api/admin/news")).status, 404);
    assert.equal((await on.post("/api/admin/news", { subject: "Hello", body: "Ten characters at least." })).status, 404);
    assert.ok((await admin.get("/api/admin/news")).data.subscribers >= 1);

    const issue = { subject: `News ${Date.now()}`, body: "First paragraph.\n\nSecond paragraph." };
    const test1 = await admin.post("/api/admin/news", { ...issue, test: true });
    assert.equal(test1.status, 200);
    assert.ok((await mails("admin@autostacc.test", "platform-news")).some((m) => m.subject.startsWith(issue.subject)));
    assert.equal((await mails(onUser.email, "platform-news")).length, 0, "a test reaches nobody else");

    assert.ok((await sendAll(admin, "/api/admin/news", issue)) >= 1);
    assert.equal(await sendAll(admin, "/api/admin/news", issue), 0, "sending the same issue again mails nobody");
    const got = await mails(onUser.email, "platform-news");
    assert.equal(got.length, 1);
    assert.match(got[0].body_text, /settings\/email/, "every news mail says how to switch it off");
    assert.equal((await mails(offUser.email, "platform-news")).length, 0);
    assert.equal((await admin.post("/api/admin/news", { subject: "x", body: "short" })).status, 400);
  });

  test("new-release mail: followers who want it, once per product; published products only", async () => {
    const admin = await adminClient(ctx.mock.url);
    const { c: fan, user: fanUser } = await newBuyer(ctx.mock.url, "fan");
    const { c: quiet, user: quietUser } = await newBuyer(ctx.mock.url, "quiet-fan");
    await fan.req("PUT", "/api/follows/glitches-and-stitches", { body: {} });
    await fan.req("PUT", "/api/account/email-preferences", { body: { newReleases: true } });
    await quiet.req("PUT", "/api/follows/glitches-and-stitches", { body: {} });
    assert.equal((await fan.post("/api/admin/products/dev-free/announce", {})).status, 404);
    assert.ok((await sendAll(admin, "/api/admin/products/dev-free/announce", {})) >= 1);
    assert.equal(await sendAll(admin, "/api/admin/products/dev-free/announce", {}), 0);
    assert.equal((await mails(fanUser.email, "new-release")).length, 1);
    assert.equal((await mails(quietUser.email, "new-release")).length, 0, "following alone isn't asking for email");
    assert.equal((await admin.post("/api/admin/products/no-such-product/announce", {})).status, 404);
  });
});

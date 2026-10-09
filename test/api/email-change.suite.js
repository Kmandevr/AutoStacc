// Changing an account's email (server/account/email-change.js): password re-checked, the new address proven by a
// signed 1-hour link, the old one told twice, Your Stacc moves along, links work once, forged ones never, and an address
// that belongs to someone else is never revealed.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, unique, outbox, linkIn } from "../support/client.js";
import { newBuyer, mockBuy } from "../support/flows.js";

const PASSWORD = "correct-horse-battery";

export default (ctx) => describe("email change", () => {
  const mails = async (to, kind) => (await outbox(ctx.mock.url, to)).filter((m) => m.kind === kind);
  const pathOf = (url) => new URL(url).pathname + new URL(url).search;

  test("confirmed by a link to the new address; the account, its Stacc and sign-in move; the old address is told", async () => {
    const { c, user } = await newBuyer(ctx.mock.url, "mover");
    await mockBuy(c, [{ productId: "wallpapers" }]);
    const next = unique("moved");
    assert.equal((await new Client(ctx.mock.url).post("/api/account/email", { email: next, password: PASSWORD })).status, 401);
    assert.equal((await c.post("/api/account/email", { email: next, password: "wrong-password-1" })).status, 403);
    assert.equal((await c.post("/api/account/email", { email: user.email, password: PASSWORD })).status, 400);
    assert.equal((await c.post("/api/account/email", { email: "not-an-email", password: PASSWORD })).status, 400);
    const evil = new Client(ctx.mock.url, { origin: "https://evil.example" });
    evil.jar = c.jar;
    assert.equal((await evil.post("/api/account/email", { email: next, password: PASSWORD })).status, 403);

    assert.equal((await c.post("/api/account/email", { email: next, password: PASSWORD })).status, 200);
    assert.equal((await mails(user.email, "email-change-notice")).length, 1, "the old address hears it was asked for");
    assert.equal((await c.get("/api/account")).data.user.email, user.email, "nothing changes before the click");
    const link = linkIn((await mails(next, "email-change-confirm"))[0]);
    const done = await c.get(pathOf(link));
    assert.equal(done.status, 303);
    assert.equal(done.headers.get("location"), "/settings/profile?email=changed");
    assert.equal((await c.get("/api/account")).data.user.email, next);
    assert.deepEqual((await c.get("/api/library")).data.items.map((i) => i.productId), ["wallpapers"], "Your Stacc moved along");
    assert.equal((await mails(user.email, "email-change-notice")).length, 2, "and hears it was done");
    assert.equal((await new Client(ctx.mock.url).post("/api/auth/sign-in/email", { email: next, password: PASSWORD })).status, 200);
    assert.notEqual((await new Client(ctx.mock.url).post("/api/auth/sign-in/email", { email: user.email, password: PASSWORD })).status, 200);
    assert.match((await c.get(pathOf(link))).headers.get("location"), /email=invalid/, "a link works once");
  });

  test("an address someone else uses gets an 'account exists' mail, never a link; forged links fail", async () => {
    const { c } = await newBuyer(ctx.mock.url, "wants");
    const { user: other } = await newBuyer(ctx.mock.url, "has");
    assert.equal((await c.post("/api/account/email", { email: other.email, password: PASSWORD })).status, 200, "same answer");
    assert.equal((await mails(other.email, "email-change-confirm")).length, 0);
    assert.ok((await mails(other.email, "account-exists")).length >= 1);
    for (const t of ["", "x.y", "a.b.c", "eyJ1IjoiYSJ9.forged"]) {
      assert.match((await c.get(`/api/account/email/confirm?t=${encodeURIComponent(t)}`)).headers.get("location"), /email=invalid/);
    }
  });
});

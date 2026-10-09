// Changing an account's email (server/account/email-change.js): password re-checked; the new address gets a signed
// 1-hour link that only the same signed-in account can use (a mail scanner or anyone else fetching it changes nothing);
// the old address is told twice; Your Stacc moves along; other devices are logged out and reset links dropped; links
// work once and go stale when the account changes; an address that has an account, or is an admin address, never gets one.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, unique, outbox, linkIn, sql } from "../support/client.js";
import { newBuyer, mockBuy } from "../support/flows.js";

const PASSWORD = "correct-horse-battery";

export default (ctx) => describe("email change", () => {
  const mails = async (to, kind) => (await outbox(ctx.mock.url, to)).filter((m) => m.kind === kind);
  const tokenIn = async (to) => new URL(linkIn((await mails(to, "email-change-confirm"))[0])).searchParams.get("confirm");
  const confirm = (client, t) => client.post("/api/account/email/confirm", { t });

  test("only the same signed-in account confirms; the account, its Stacc and sign-in move; other devices go", async () => {
    const { c, user } = await newBuyer(ctx.mock.url, "mover");
    const phone = new Client(ctx.mock.url);
    assert.equal((await phone.post("/api/auth/sign-in/email", { email: user.email, password: PASSWORD })).status, 200);
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
    const t = await tokenIn(next);
    assert.ok(t, "the link opens Settings with the token");
    // Whoever fetches the link without being this account changes nothing.
    assert.equal((await new Client(ctx.mock.url).get(`/settings/profile?confirm=${encodeURIComponent(t)}`)).status, 302);
    assert.equal((await confirm(new Client(ctx.mock.url), t)).status, 401);
    const { c: stranger } = await newBuyer(ctx.mock.url, "stranger");
    assert.equal((await confirm(stranger, t)).status, 403, "another account can't use it");
    assert.equal((await c.get("/api/account")).data.user.email, user.email, "nothing changed yet");

    const ok = await confirm(c, t);
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal((await c.get("/api/account")).data.user.email, next);
    assert.deepEqual((await c.get("/api/library")).data.items.map((i) => i.productId), ["wallpapers"], "Your Stacc moved along");
    assert.equal((await phone.get("/api/account")).data.user, null, "other devices are logged out");
    assert.equal((await mails(user.email, "email-change-notice")).length, 2, "the old address hears it was done");
    assert.equal((await new Client(ctx.mock.url).post("/api/auth/sign-in/email", { email: next, password: PASSWORD })).status, 200);
    assert.notEqual((await new Client(ctx.mock.url).post("/api/auth/sign-in/email", { email: user.email, password: PASSWORD })).status, 200);
    assert.equal((await confirm(c, t)).status, 400, "a link works once");
  });

  test("a link goes stale when the account changes; forged links fail", async () => {
    const { c, user } = await newBuyer(ctx.mock.url, "stale");
    const next = unique("stale-new");
    await c.post("/api/account/email", { email: next, password: PASSWORD });
    const t = await tokenIn(next);
    sql(ctx.mock.stateDir, `UPDATE "user" SET updatedAt = '2030-01-01T00:00:00.000Z' WHERE id = '${user.id}'`);
    assert.equal((await confirm(c, t)).status, 400);
    for (const bad of ["", "x.y", "a.b.c", `${t}x`]) assert.equal((await confirm(c, bad)).status, 400);
    assert.equal((await c.get("/api/account")).data.user.email, user.email);
  });

  test("an address with an account gets 'account exists', an admin address gets nothing; the answer is the same", async () => {
    const { c } = await newBuyer(ctx.mock.url, "wants");
    const { user: other } = await newBuyer(ctx.mock.url, "has");
    assert.equal((await c.post("/api/account/email", { email: other.email, password: PASSWORD })).status, 200);
    assert.equal((await mails(other.email, "email-change-confirm")).length, 0);
    assert.ok((await mails(other.email, "account-exists")).length >= 1);
    const { c: c2 } = await newBuyer(ctx.mock.url, "wants-admin");
    assert.equal((await c2.post("/api/account/email", { email: "admin@autostacc.test", password: PASSWORD })).status, 200);
    assert.equal((await mails("admin@autostacc.test", "email-change-confirm")).length, 0, "no link ever goes to an admin address");
  });
});

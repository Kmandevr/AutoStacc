// Accounts: unauthorised access, bad and expired sessions, cross-account access, password reset abuse, account
// enumeration, unverified accounts and role escalation. Everything here must fail closed.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, outbox, linkIn, sql, unique } from "../support/client.js";
import { mockBuy } from "../support/flows.js";

export default (ctx) => describe("auth", () => {
  test("private endpoints refuse anonymous requests", async () => {
    const anon = new Client(ctx.mock.url);
    for (const p of ["/api/library", "/api/orders"]) assert.equal((await anon.get(p)).status, 401, p);
    assert.equal((await anon.post("/api/downloads", { fileId: "pf_abcdefgh" })).status, 401);
    assert.equal((await anon.post("/api/library/free", { productId: "dev-free" })).status, 401);
    // Admin routes don't even admit they exist.
    for (const p of ["/api/admin/summary", "/api/admin/orders", "/api/admin/customers"]) assert.equal((await anon.get(p)).status, 404, p);
  });

  test("a forged session cookie is no session", async () => {
    const c = new Client(ctx.mock.url);
    c.jar.set("gs.session_token", "forged.token-value");
    assert.equal((await c.get("/api/library")).status, 401);
    assert.equal((await c.get("/api/account")).data.user, null);
  });

  test("an expired session stops working", async () => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("expire"));
    assert.equal((await c.get("/api/library")).status, 200);
    sql(ctx.mock.stateDir, `UPDATE session SET expiresAt = '2000-01-01T00:00:00.000Z' WHERE userId = '${user.id}'`);
    assert.equal((await c.get("/api/library")).status, 401);
  });

  test("sign-out ends the session", async () => {
    const c = new Client(ctx.mock.url);
    await verifiedUser(c, unique("signout"));
    const stolen = new Map(c.jar);
    await c.post("/api/auth/sign-out", {});
    assert.equal((await c.get("/api/library")).status, 401);
    const replay = new Client(ctx.mock.url);
    replay.jar = stolen; // an old cookie copied before sign-out
    assert.equal((await replay.get("/api/library")).status, 401);
  });

  test("one account can't see another's orders or library", async () => {
    const a = new Client(ctx.mock.url), b = new Client(ctx.mock.url);
    await verifiedUser(a, unique("alice"));
    await verifiedUser(b, unique("bob"));
    const { orderId } = await mockBuy(a, [{ productId: "wallpapers" }]);
    assert.equal((await b.get(`/api/orders/${orderId}`)).status, 404);
    assert.equal((await b.post(`/api/orders/${orderId}/reconcile`, {})).status, 404);
    assert.ok(!(await b.get("/api/orders")).data.orders.some((o) => o.id === orderId));
    assert.equal((await b.get("/api/library")).data.items.length, 0);
    assert.equal((await a.get(`/api/orders/${orderId}`)).data.order.status, "paid");
  });

  test("sign-up doesn't reveal whether an email has an account", async () => {
    const email = unique("taken");
    const first = await new Client(ctx.mock.url).post("/api/auth/sign-up/email", { email, password: "first-password-1", name: "A" });
    const again = await new Client(ctx.mock.url).post("/api/auth/sign-up/email", { email, password: "second-password-2", name: "B" });
    assert.equal(first.status, 200);
    assert.equal(again.status, first.status);
    assert.deepEqual(Object.keys(again.data).sort(), Object.keys(first.data).sort());
    assert.equal(again.data.token, null);
    // The real owner is told instead.
    assert.ok((await outbox(ctx.mock.url, email)).some((m) => m.kind === "account-exists"));
  });

  test("sign-in errors are the same for a wrong password and an unknown email", async () => {
    const c = new Client(ctx.mock.url);
    const email = unique("known");
    await verifiedUser(c, email);
    const wrong = await new Client(ctx.mock.url).post("/api/auth/sign-in/email", { email, password: "not-the-password" });
    const unknown = await new Client(ctx.mock.url).post("/api/auth/sign-in/email", { email: unique("nobody"), password: "not-the-password" });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.data.code, unknown.data.code);
  });

  test("an unverified account can't sign in or buy as itself", async () => {
    const c = new Client(ctx.mock.url);
    const email = unique("unverified");
    await c.post("/api/auth/sign-up/email", { email, password: "unverified-pass-1", name: "U" });
    const r = await c.post("/api/auth/sign-in/email", { email, password: "unverified-pass-1" });
    assert.equal(r.status, 403);
    assert.equal((await c.get("/api/account")).data.user, null);
  });

  test("password reset: same answer for unknown emails, tokens are single-use, bad tokens fail", async () => {
    const c = new Client(ctx.mock.url);
    const email = unique("reset");
    await verifiedUser(c, email);
    const known = await new Client(ctx.mock.url).post("/api/auth/request-password-reset", { email, redirectTo: "/login" });
    const unknown = await new Client(ctx.mock.url).post("/api/auth/request-password-reset", { email: unique("ghost"), redirectTo: "/login" });
    assert.equal(known.status, 200);
    assert.deepEqual(unknown.data, known.data);
    const link = linkIn((await outbox(ctx.mock.url, email)).find((m) => m.kind === "reset-password"));
    const redirect = await c.get(new URL(link).pathname + new URL(link).search);
    const token = new URL(redirect.headers.get("location"), ctx.mock.url).searchParams.get("token");
    assert.ok(token);
    assert.equal((await c.post("/api/auth/reset-password", { token: "not-a-real-token", newPassword: "new-password-123" })).status, 400);
    assert.equal((await c.post("/api/auth/reset-password", { token, newPassword: "new-password-123" })).status, 200);
    assert.equal((await c.post("/api/auth/reset-password", { token, newPassword: "other-password-456" })).status, 400);
    // The reset logged out every session, including this one.
    assert.equal((await c.get("/api/library")).status, 401);
    assert.equal((await new Client(ctx.mock.url).post("/api/auth/sign-in/email", { email, password: "new-password-123" })).status, 200);
  });

  test("password reset requests are rate limited", async () => {
    const c = new Client(ctx.mock.url);
    const codes = [];
    for (let i = 0; i < 8; i++) codes.push((await c.post("/api/auth/request-password-reset", { email: unique("spam"), redirectTo: "/login" })).status);
    assert.ok(codes.includes(429), codes.join(","));
  });

  test("sign-in is rate limited per client", async () => {
    const c = new Client(ctx.mock.url);
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await c.post("/api/auth/sign-in/email", { email: "a@b.dev", password: "guessing-" + i })).status);
    assert.ok(codes.includes(429), codes.join(","));
  });

  test("customers can't make themselves admin", async () => {
    const c = new Client(ctx.mock.url);
    const email = unique("sneaky");
    await c.post("/api/auth/sign-up/email", { email, password: "sneaky-password-1", name: "S", role: "admin" });
    const mail = (await outbox(ctx.mock.url, email)).find((m) => m.kind === "verify-email");
    await c.get(new URL(linkIn(mail)).pathname + new URL(linkIn(mail)).search);
    await c.post("/api/auth/update-user", { role: "admin" });
    const me = await c.get("/api/account");
    assert.equal(me.data.user.admin, false);
    assert.equal((await c.get("/api/admin/summary")).status, 404);
    assert.equal(sql(ctx.mock.stateDir, `SELECT role FROM "user" WHERE email = '${email}'`)[0].role, "customer");
  });

  test("a pre-registered account can't be used to take a buyer's purchases", async () => {
    const victim = unique("prereg-victim");
    await mockBuy(new Client(ctx.mock.url), [{ productId: "vj-loops" }], { email: victim });
    const attacker = new Client(ctx.mock.url);
    await attacker.post("/api/auth/sign-up/email", { email: victim, password: "attacker-pass-123", name: "M" });
    const verifyMails = async () => (await outbox(ctx.mock.url, victim)).filter((m) => m.kind === "verify-email").length;
    assert.equal(await verifyMails(), 1);
    // The attacker can't make the site keep mailing the victim confirmation links.
    await attacker.post("/api/auth/sign-in/email", { email: victim, password: "attacker-pass-123" });
    assert.equal((await attacker.post("/api/auth/send-verification-email", { email: victim })).status, 404);
    assert.equal(await verifyMails(), 1);
    // The real owner resets the password: that proves the inbox, verifies the account and adopts the purchase.
    const owner = new Client(ctx.mock.url);
    await owner.post("/api/auth/request-password-reset", { email: victim, redirectTo: "/login" });
    const link = linkIn((await outbox(ctx.mock.url, victim)).find((m) => m.kind === "reset-password"));
    const token = new URL((await owner.get(new URL(link).pathname + new URL(link).search)).headers.get("location"), ctx.mock.url).searchParams.get("token");
    assert.equal((await owner.post("/api/auth/reset-password", { token, newPassword: "owner-pass-456" })).status, 200);
    assert.equal((await owner.post("/api/auth/sign-in/email", { email: victim, password: "owner-pass-456" })).status, 200);
    assert.deepEqual((await owner.get("/api/library")).data.items.map((i) => i.productId), ["vj-loops"]);
    assert.equal((await new Client(ctx.mock.url).post("/api/auth/sign-in/email", { email: victim, password: "attacker-pass-123" })).status, 401);
    assert.ok((await outbox(ctx.mock.url, victim)).some((m) => m.kind === "purchases-linked"));
  });
});

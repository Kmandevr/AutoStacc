// Account settings (docs/store.md#accounts): signed-in devices (only your own, never their tokens), optional-email
// switches, the data export, and deleting an account (password and email to confirm; orders stay anonymous, access
// ends, nothing else of the person remains). None of it is open to strangers, other sites or an impersonating admin.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql, verifiedUser } from "../support/client.js";
import { newBuyer, mockBuy, adminClient, freshAdmin } from "../support/flows.js";

const PASSWORD = "correct-horse-battery";

async function secondDevice(base, email) {
  const c = new Client(base);
  const r = await c.post("/api/auth/sign-in/email", { email, password: PASSWORD });
  assert.equal(r.status, 200);
  return c;
}

export default (ctx) => describe("account", () => {
  test("devices: your own sessions only, without tokens; sign one out or all the others", async () => {
    const anon = new Client(ctx.mock.url);
    assert.equal((await anon.get("/api/account/devices")).status, 401);
    const { c, user } = await newBuyer(ctx.mock.url, "devices");
    const phone = await secondDevice(ctx.mock.url, user.email);
    const list = await c.get("/api/account/devices");
    assert.equal(list.status, 200);
    assert.equal(list.data.devices.length, 2);
    assert.equal(list.data.devices.filter((d) => d.current).length, 1);
    assert.ok(!/token/i.test(JSON.stringify(list.data)), "no tokens in the answer");
    const tokens = sql(ctx.mock.stateDir, `SELECT token FROM "session" WHERE "userId" = '${user.id}'`).map((r) => r.token);
    for (const t of tokens) assert.ok(!JSON.stringify(list.data).includes(t));
    // Better Auth's own list (which includes tokens) is switched off.
    assert.equal((await c.get("/api/auth/list-sessions")).status, 404);
    const other = list.data.devices.find((d) => !d.current);
    const current = list.data.devices.find((d) => d.current);

    // Someone else can't sign out your device, even knowing its id; the answer is "not there".
    const { c: stranger } = await newBuyer(ctx.mock.url, "devices-stranger");
    assert.equal((await stranger.post(`/api/account/devices/${other.id}/sign-out`, {})).status, 404);
    assert.ok((await phone.get("/api/account")).data.user, "still signed in");
    // Another site can't do it with your cookies either.
    const evil = new Client(ctx.mock.url, { origin: "https://evil.example" });
    evil.jar = c.jar;
    assert.equal((await evil.post(`/api/account/devices/${other.id}/sign-out`, {})).status, 403);
    // This device is Log out's job.
    assert.equal((await c.post(`/api/account/devices/${current.id}/sign-out`, {})).status, 400);

    assert.equal((await c.post(`/api/account/devices/${other.id}/sign-out`, {})).status, 200);
    assert.equal((await phone.get("/api/account")).data.user, null, "the other device is signed out");
    assert.ok((await c.get("/api/account")).data.user, "this one isn't");

    const tablet = await secondDevice(ctx.mock.url, user.email);
    const laptop = await secondDevice(ctx.mock.url, user.email);
    assert.equal((await c.post("/api/account/devices/sign-out-others", {})).status, 200);
    for (const d of [tablet, laptop]) assert.equal((await d.get("/api/account")).data.user, null);
    assert.deepEqual((await c.get("/api/account/devices")).data.devices.map((d) => d.current), [true]);
  });

  test("email preferences: off until switched on, only known switches, only booleans", async () => {
    const anon = new Client(ctx.mock.url);
    assert.equal((await anon.get("/api/account/email-preferences")).status, 401);
    assert.equal((await anon.req("PUT", "/api/account/email-preferences", { body: { newReleases: true } })).status, 401);
    const { c, user } = await newBuyer(ctx.mock.url, "prefs");
    assert.deepEqual((await c.get("/api/account/email-preferences")).data.preferences, { newReleases: false, platformNews: false });
    const on = await c.req("PUT", "/api/account/email-preferences", { body: { newReleases: true } });
    assert.equal(on.status, 200);
    assert.deepEqual(on.data.preferences, { newReleases: true, platformNews: false });
    assert.equal((await c.req("PUT", "/api/account/email-preferences", { body: { receipts: false } })).status, 400);
    assert.equal((await c.req("PUT", "/api/account/email-preferences", { body: { platformNews: "yes" } })).status, 400);
    const evil = new Client(ctx.mock.url, { origin: "https://evil.example" });
    evil.jar = c.jar;
    assert.equal((await evil.req("PUT", "/api/account/email-preferences", { body: { platformNews: true } })).status, 403);
    assert.deepEqual(sql(ctx.mock.stateDir, `SELECT new_releases, platform_news FROM email_preferences WHERE user_id = '${user.id}'`),
      [{ new_releases: 1, platform_news: 0 }]);
  });

  test("data export: your orders, library, follows and votes; nobody else's; never a token; POST only", async () => {
    const anon = new Client(ctx.mock.url);
    assert.equal((await anon.post("/api/account/export", {})).status, 401);
    const { c, user } = await newBuyer(ctx.mock.url, "export");
    const { orderId } = await mockBuy(c, [{ productId: "wallpapers" }]);
    await c.req("PUT", "/api/follows/dev-other", { body: {} });
    await c.post("/api/polls/dev-poll/vote", { optionId: "scrap-it" });
    const { c: other } = await newBuyer(ctx.mock.url, "export-other");
    const { orderId: theirs } = await mockBuy(other, [{ productId: "wallpapers" }]);

    assert.equal((await c.get("/api/account/export")).status, 405);
    const r = await c.post("/api/account/export", {});
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-disposition"), /^attachment; filename="autostacc-data-\d{4}-\d\d-\d\d\.json"$/);
    assert.equal(r.data.account.email, user.email);
    assert.deepEqual(r.data.orders.map((o) => o.id), [orderId]);
    assert.ok(r.data.library.some((e) => e.productId === "wallpapers" && e.status === "active"));
    assert.deepEqual(r.data.follows.map((f) => f.projectId), ["dev-other"]);
    assert.deepEqual(r.data.pollVotes.map((v) => [v.pollId, v.optionId]), [["dev-poll", "scrap-it"]]);
    assert.ok(r.data.emailsSent.some((m) => m.kind === "verify-email"));
    const text = JSON.stringify(r.data);
    assert.ok(!text.includes(theirs), "no other customer's order");
    for (const t of sql(ctx.mock.stateDir, `SELECT token FROM "session" WHERE "userId" = '${user.id}'`).map((x) => x.token)) assert.ok(!text.includes(t));
    const evil = new Client(ctx.mock.url, { origin: "https://evil.example" });
    evil.jar = c.jar;
    assert.equal((await evil.post("/api/account/export", {})).status, 403);
  });

  test("deleting an account needs the email and password; orders stay anonymous, access and the person go", async () => {
    const { c, user } = await newBuyer(ctx.mock.url, "leaver");
    const phone = await secondDevice(ctx.mock.url, user.email);
    const { orderId } = await mockBuy(c, [{ productId: "wallpapers" }]);
    await c.req("PUT", "/api/follows/dev-other", { body: { autoStacc: true } });
    await c.post("/api/polls/dev-poll/vote", { optionId: "scrap-it" });
    await c.req("PUT", "/api/account/email-preferences", { body: { platformNews: true } });

    assert.equal((await new Client(ctx.mock.url).post("/api/account/delete", { confirm: user.email, password: PASSWORD })).status, 401);
    assert.equal((await c.post("/api/account/delete", { confirm: "someone@else.dev", password: PASSWORD })).status, 400);
    const wrong = await c.post("/api/account/delete", { confirm: user.email, password: "not-the-password" });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.data.error.code, "invalid_password");
    const evil = new Client(ctx.mock.url, { origin: "https://evil.example" });
    evil.jar = c.jar;
    assert.equal((await evil.post("/api/account/delete", { confirm: user.email, password: PASSWORD })).status, 403);
    assert.equal(sql(ctx.mock.stateDir, `SELECT COUNT(*) AS n FROM "user" WHERE id = '${user.id}'`)[0].n, 1, "nothing happened yet");

    const ok = await c.post("/api/account/delete", { confirm: user.email.toUpperCase(), password: PASSWORD });
    assert.equal(ok.status, 200);
    assert.equal((await c.get("/api/account")).data.user, null);
    assert.equal((await phone.get("/api/account")).data.user, null, "every device is signed out");
    assert.notEqual((await new Client(ctx.mock.url).post("/api/auth/sign-in/email", { email: user.email, password: PASSWORD })).status, 200);

    const db = (q) => sql(ctx.mock.stateDir, q);
    assert.equal(db(`SELECT COUNT(*) AS n FROM "user" WHERE id = '${user.id}' OR email = '${user.email}'`)[0].n, 0);
    for (const t of ["session", "account"]) assert.equal(db(`SELECT COUNT(*) AS n FROM "${t}" WHERE "userId" = '${user.id}'`)[0].n, 0);
    const [order] = db(`SELECT user_id, email, status, total_cents FROM orders WHERE id = '${orderId}'`);
    assert.equal(order.user_id, null);
    assert.match(order.email, /^deleted-[a-z2-7]+@deleted\.invalid$/);
    assert.equal(order.status, "paid", "the sale is still on record");
    assert.ok(order.total_cents > 0);
    assert.equal(db(`SELECT COUNT(*) AS n FROM entitlements WHERE user_id = '${user.id}' OR email = '${user.email}' OR (email = '${order.email}' AND status = 'active')`)[0].n, 0);
    for (const t of ["follows", "poll_votes", "email_preferences", "creator_members"]) assert.equal(db(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = '${user.id}'`)[0].n, 0, t);
    assert.equal(db(`SELECT COUNT(*) AS n FROM email_events WHERE to_email = '${user.email}'`)[0].n, 0);

    // The same email can start over, and gets nothing of the old account.
    const again = new Client(ctx.mock.url);
    const fresh = await verifiedUser(again, user.email);
    assert.notEqual(fresh.id, user.id);
    assert.deepEqual((await again.get("/api/library")).data.items, []);
  });

  test("deletion waits while a checkout is still open, so a late payment can't land on an erased account", async () => {
    const { c, user } = await newBuyer(ctx.mock.url, "open-checkout");
    const co = await c.post("/api/checkout", { items: [{ productId: "wallpapers" }] });
    assert.ok([200, 201].includes(co.status));
    const r = await c.post("/api/account/delete", { confirm: user.email, password: PASSWORD });
    assert.equal(r.status, 409);
    assert.equal(r.data.error.code, "checkout_open");
    assert.equal(sql(ctx.mock.stateDir, `SELECT COUNT(*) AS n FROM "user" WHERE id = '${user.id}'`)[0].n, 1);
    // Once it has settled (here: the payment page expired), the account can go.
    const sessionId = new URL(co.data.url).searchParams.get("mock");
    await c.post("/api/dev/mock-payment", { orderId: co.data.orderId, sessionId, outcome: "expired" });
    assert.equal((await c.post("/api/account/delete", { confirm: user.email, password: PASSWORD })).status, 200);
  });

  test("deletion is refused for admins and for the owner of a creator space", async () => {
    const admin = await adminClient(ctx.mock.url);
    const a = await admin.post("/api/account/delete", { confirm: "admin@autostacc.test", password: "admin-password-123" });
    assert.equal(a.status, 409);
    assert.equal(a.data.error.code, "admin_account");
    const { c, user } = await newBuyer(ctx.mock.url, "creator-owner");
    const slug = `owner${Date.now().toString(36)}`;
    assert.equal((await c.post("/api/studio/creators", { name: "Owner", slug })).status, 201);
    const r = await c.post("/api/account/delete", { confirm: user.email, password: PASSWORD });
    assert.equal(r.status, 409);
    assert.equal(r.data.error.code, "owns_creator");
    assert.ok((await c.get("/api/account")).data.user, "still there");
  });

  test("an admin impersonating a customer can't see their devices, export, delete or change their settings", async () => {
    const { user } = await newBuyer(ctx.mock.url, "imp-settings");
    const admin = await freshAdmin(ctx.mock.url);
    assert.equal((await admin.post(`/api/admin/customers/${user.id}/impersonate`, { note: "settings check" })).status, 201);
    assert.equal((await admin.get("/api/account")).data.user.email, user.email);
    assert.equal((await admin.get("/api/account/devices")).status, 403);
    assert.equal((await admin.post("/api/account/export", {})).status, 403);
    assert.equal((await admin.req("PUT", "/api/account/email-preferences", { body: { platformNews: true } })).status, 403);
    assert.equal((await admin.post("/api/account/devices/sign-out-others", {})).status, 403);
    assert.equal((await admin.post("/api/account/delete", { confirm: user.email, password: PASSWORD })).status, 403);
    assert.equal(sql(ctx.mock.stateDir, `SELECT COUNT(*) AS n FROM "user" WHERE id = '${user.id}'`)[0].n, 1);
    await admin.post("/api/impersonation/exit", {});
  });
});

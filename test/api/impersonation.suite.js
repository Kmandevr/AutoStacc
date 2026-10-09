// Impersonation and test purchases: only an admin starts one, only for an existing non-admin customer; the
// impersonated view is that customer and nothing more (no admin API, no other customer, no account changes, not
// the admin's own guest orders); exit restores the admin; stale, replayed, stolen and expired cookies fail closed;
// the audit log names the real admin behind every action. Test purchases go through the real checkout.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql, unique } from "../support/client.js";
import { newBuyer, adminClient, freshAdmin, mockBuy, mockOutcome, stripeCheckout, stripePay } from "../support/flows.js";

const COOKIE = "gs_impersonation";
const ADMIN = "admin@autostacc.test";

async function impersonate(admin, userId, note = "test") {
  return admin.post(`/api/admin/customers/${userId}/impersonate`, { note });
}

// A customer who owns "wallpapers", and a file for it to download.
async function setup(ctx) {
  const owner = await adminClient(ctx.mock.url);
  const up = await owner.req("PUT", "/api/admin/products/wallpapers/files?filename=walls.zip&label=Walls", { raw: Buffer.from("PK\u0003\u0004 zip bytes", "latin1"), headers: { "Content-Type": "application/zip" } });
  assert.equal(up.status, 201);
  const { c, user } = await newBuyer(ctx.mock.url, "imp-customer");
  const { orderId } = await mockBuy(c, [{ productId: "wallpapers" }]);
  return { customer: c, user, orderId, fileId: up.data.fileId };
}

export default (ctx) => describe("impersonation", () => {
  test("customers and strangers can't impersonate anyone", async () => {
    const { user } = await newBuyer(ctx.mock.url, "imp-target");
    const { c: other } = await newBuyer(ctx.mock.url, "imp-attacker");
    const anon = new Client(ctx.mock.url);
    for (const c of [other, anon]) {
      const r = await impersonate(c, user.id);
      assert.equal(r.status, 404);
      assert.ok(!c.jar.has(COOKIE));
      assert.equal((await c.post("/api/admin/test-purchases", { userId: user.id, productId: "wallpapers" })).status, 404);
    }
    assert.equal(sql(ctx.mock.stateDir, `SELECT COUNT(*) AS n FROM impersonations WHERE customer_user_id = '${user.id}'`)[0].n, 0);
  });

  test("only existing, non-admin customers can be impersonated", async () => {
    const admin = await freshAdmin(ctx.mock.url);
    assert.equal((await impersonate(admin, "doesNotExist12345")).status, 404);
    assert.equal((await impersonate(admin, "../../etc")).status, 404);
    const me = (await admin.get("/api/account")).data.user;
    assert.equal((await impersonate(admin, me.id)).status, 409);
    const { user } = await newBuyer(ctx.mock.url, "imp-other-admin");
    sql(ctx.mock.stateDir, `UPDATE "user" SET role = 'admin' WHERE id = '${user.id}'`);
    assert.equal((await impersonate(admin, user.id)).status, 409);
    assert.ok(!admin.jar.has(COOKIE));
  });

  test("the admin sees exactly the customer's store, and nothing else", async () => {
    const { user, orderId } = await setup(ctx);
    // The admin's browser holds a guest order of its own from before signing in: it must not leak into the view.
    const admin = new Client(ctx.mock.url);
    const guest = await mockBuy(admin, [{ productId: "vj-loops" }], { email: unique("admin-guest") });
    await adminClient(ctx.mock.url);
    assert.equal((await admin.post("/api/auth/sign-in/email", { email: ADMIN, password: "admin-password-123" })).status, 200);
    const { c: stranger } = await newBuyer(ctx.mock.url, "imp-stranger");
    const strangerOrder = await mockBuy(stranger, [{ productId: "vj-loops" }]);

    const start = await impersonate(admin, user.id);
    assert.equal(start.status, 201);
    assert.equal(start.data.redirect, "/dashboard");
    assert.ok(admin.jar.has(COOKIE));

    const me = (await admin.get("/api/account")).data;
    assert.equal(me.user.email, user.email);
    assert.equal(me.user.admin, false);
    assert.equal(me.guestOrders, 0);
    assert.equal(me.impersonation.active, true);
    assert.equal(me.impersonation.admin.email, ADMIN);
    assert.equal(me.impersonation.customer.email, user.email);

    assert.deepEqual((await admin.get("/api/library")).data.items.map((i) => i.productId), ["wallpapers"]);
    assert.deepEqual((await admin.get("/api/orders")).data.orders.map((o) => o.id), [orderId]);
    assert.equal((await admin.get(`/api/orders/${strangerOrder.orderId}`)).status, 404);
    assert.equal((await admin.get(`/api/orders/${guest.orderId}`)).status, 404);

    // No admin API while impersonating: reads vanish, writes are refused.
    for (const p of ["/api/admin/summary", "/api/admin/customers", "/api/admin/stats", "/api/admin/audit", `/api/admin/customers/${user.id}`]) {
      assert.equal((await admin.get(p)).status, 404, p);
    }
    assert.equal((await admin.post("/api/admin/entitlements", { email: user.email, productId: "vj-loops" })).status, 403);
    assert.equal((await impersonate(admin, user.id)).status, 403, "no starting another one from inside");

    // Nothing that changes the customer's account, or the admin's own through Better Auth.
    assert.equal((await admin.post("/api/library/free", { productId: "wallpapers" })).data.error.code, "impersonation_blocked");
    assert.equal((await admin.req("PUT", "/api/follows/glitches-and-stitches", { body: { autoStacc: true } })).status, 403);
    for (const p of ["/api/auth/change-password", "/api/auth/update-user", "/api/auth/sign-out"]) {
      const r = await admin.post(p, { name: "hacked", currentPassword: "admin-password-123", newPassword: "something-else-123" });
      assert.equal(r.status, 403, p);
    }
    assert.equal(sql(ctx.mock.stateDir, `SELECT name FROM "user" WHERE email = '${user.email}'`)[0].name, user.name);
    assert.equal((await admin.get("/api/auth/get-session")).status, 403);

    const exit = await admin.post("/api/impersonation/exit", {});
    assert.equal(exit.status, 200);
    assert.equal(exit.data.redirect, "/admin");
    assert.ok(!admin.jar.has(COOKIE));
    const back = (await admin.get("/api/account")).data;
    assert.equal(back.user.email, ADMIN);
    assert.equal(back.user.admin, true);
    assert.equal(back.impersonation, null);
    assert.equal((await admin.get("/api/admin/summary")).status, 200);
  });

  test("ended, replayed, stolen, idle and expired impersonations fail closed", async () => {
    const { user, customer } = await setup(ctx);
    const admin = await freshAdmin(ctx.mock.url);
    await impersonate(admin, user.id);
    const token = admin.jar.get(COOKIE);

    // Stolen: the cookie in another browser (a customer's, or another admin session) is worthless, and burns it.
    const thief = new Client(ctx.mock.url);
    thief.jar = new Map(customer.jar);
    thief.jar.set(COOKIE, token);
    const stolen = await thief.get("/api/library");
    assert.equal(stolen.status, 401);
    assert.equal(stolen.data.error.code, "impersonation_ended");
    assert.equal((await thief.get("/api/account")).data.user, null);
    // ...and the real admin's impersonation ended with it, visibly.
    const after = await admin.get("/api/account");
    assert.equal(after.data.impersonation.active, false);
    assert.equal(after.data.user, null);
    assert.equal((await admin.get("/api/library")).status, 401);
    assert.equal((await admin.get("/api/admin/summary")).status, 401);
    assert.equal((await admin.post("/api/impersonation/exit", {})).status, 200);
    assert.equal((await admin.get("/api/admin/summary")).status, 200);

    // Replayed after exit: still dead.
    await impersonate(admin, user.id);
    const old = admin.jar.get(COOKIE);
    await admin.post("/api/impersonation/exit", {});
    admin.jar.set(COOKIE, old);
    assert.equal((await admin.get("/api/library")).status, 401);
    await admin.post("/api/impersonation/exit", {});

    // Forged and mangled tokens: refused, and exit still works.
    for (const bad of ["a".repeat(52), "%E0"]) {
      admin.jar.set(COOKIE, bad);
      assert.equal((await admin.get("/api/orders")).status, 401, bad);
      assert.equal((await admin.get("/api/account")).status, 200, bad);
      assert.equal((await admin.post("/api/impersonation/exit", {})).status, 200, bad);
    }

    // The banner's poll isn't activity: an open tab doesn't keep an idle impersonation alive. Real requests are.
    const polled = await impersonate(admin, user.id);
    const ago = new Date(Date.now() - 10 * 60000).toISOString();
    sql(ctx.mock.stateDir, `UPDATE impersonations SET last_seen_at = '${ago}' WHERE id = '${polled.data.impersonationId}'`);
    await admin.get("/api/account", { headers: { "X-Impersonation-Poll": "1" } });
    assert.equal(sql(ctx.mock.stateDir, `SELECT last_seen_at FROM impersonations WHERE id = '${polled.data.impersonationId}'`)[0].last_seen_at, ago);
    await admin.get("/api/library");
    assert.notEqual(sql(ctx.mock.stateDir, `SELECT last_seen_at FROM impersonations WHERE id = '${polled.data.impersonationId}'`)[0].last_seen_at, ago);
    await admin.post("/api/impersonation/exit", {});

    // Idle and time limit.
    for (const [col, reason] of [["last_seen_at", "idle"], ["expires_at", "time limit"]]) {
      const r = await impersonate(admin, user.id);
      sql(ctx.mock.stateDir, `UPDATE impersonations SET ${col} = '2000-01-01T00:00:00.000Z' WHERE id = '${r.data.impersonationId}'`);
      assert.equal((await admin.get("/api/library")).status, 401);
      assert.equal(sql(ctx.mock.stateDir, `SELECT end_reason FROM impersonations WHERE id = '${r.data.impersonationId}'`)[0].end_reason, reason);
      await admin.post("/api/impersonation/exit", {});
    }

    // The admin's session ending (signed out elsewhere, expired) ends the impersonation too.
    const r = await impersonate(admin, user.id);
    sql(ctx.mock.stateDir, `DELETE FROM session WHERE id = (SELECT admin_session_id FROM impersonations WHERE id = '${r.data.impersonationId}')`);
    assert.equal((await admin.get("/api/library")).status, 401);
    assert.equal(sql(ctx.mock.stateDir, `SELECT ended_at IS NOT NULL AS ended FROM impersonations WHERE id = '${r.data.impersonationId}'`)[0].ended, 1);
  });

  test("the audit log names the admin behind every impersonated action", async () => {
    const { user, customer, fileId } = await setup(ctx);
    const admin = await freshAdmin(ctx.mock.url);
    const start = await impersonate(admin, user.id, "support ticket 42");
    const imp = start.data.impersonationId;
    const dl = await admin.post("/api/downloads", { fileId });
    assert.equal(dl.status, 200);
    const served = await admin.get(new URL(dl.data.url, ctx.mock.url).pathname);
    assert.equal(served.status, 200);
    await admin.post("/api/impersonation/exit", {});
    // The customer's own download is theirs, not the admin's.
    const own = await customer.post("/api/downloads", { fileId });
    assert.equal(own.status, 200);

    const rows = sql(ctx.mock.stateDir, `SELECT action, actor_label, actor_user_id, subject_user_id, target_id FROM admin_audit WHERE impersonation_id = '${imp}' ORDER BY at`);
    assert.deepEqual(rows.map((r) => r.action), ["impersonation.started", "impersonation.request", "impersonation.request", "impersonation.ended"]);
    for (const r of rows) {
      assert.equal(r.actor_label, ADMIN);
      assert.equal(r.subject_user_id, user.id);
      assert.notEqual(r.actor_user_id, user.id);
    }
    assert.deepEqual(rows.slice(1, 3).map((r) => r.target_id), ["POST /api/downloads", "GET /api/downloads/:token"]);
    assert.ok(!JSON.stringify(rows).includes(dl.data.url.split("/").pop()), "no download token in the log");
    const events = sql(ctx.mock.stateDir, `SELECT impersonation_id FROM download_events WHERE file_id = '${fileId}' AND event = 'issued' ORDER BY created_at`);
    assert.deepEqual(events.map((e) => e.impersonation_id), [imp, null]);

    // The admin can read it, customers can't, and nobody can rewrite it.
    const log = await admin.get(`/api/admin/audit?impersonation=${imp}`);
    assert.equal(log.data.entries.length, 4);
    assert.ok(log.data.entries.every((e) => e.actor === ADMIN && e.subjectEmail === user.email));
    assert.equal((await customer.get("/api/admin/audit")).status, 404);
    assert.throws(() => sql(ctx.mock.stateDir, `UPDATE admin_audit SET actor_label = 'someone' WHERE impersonation_id = '${imp}'`));
    assert.throws(() => sql(ctx.mock.stateDir, `DELETE FROM admin_audit WHERE impersonation_id = '${imp}'`));
  });

  test("customer preview is read-only, admin-only and recorded", async () => {
    const { user, customer, orderId } = await setup(ctx);
    const admin = await freshAdmin(ctx.mock.url);
    const p = await admin.get(`/api/admin/customers/${user.id}`);
    assert.equal(p.status, 200);
    assert.deepEqual(p.data.library.map((x) => x.productId), ["wallpapers"]);
    assert.deepEqual(p.data.orders.map((o) => o.id), [orderId]);
    assert.equal(p.data.canImpersonate, true);
    assert.ok(!admin.jar.has(COOKIE), "previewing doesn't impersonate");
    assert.equal((await customer.get(`/api/admin/customers/${user.id}`)).status, 404);
    assert.equal(sql(ctx.mock.stateDir, `SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'customer.previewed' AND target_id = '${user.id}'`)[0].n, 1);
  });

  test("a test purchase runs the real checkout as the customer, and verifies end to end", async () => {
    const { user, fileId } = await setup(ctx);
    const admin = await freshAdmin(ctx.mock.url);
    assert.equal((await admin.post("/api/admin/test-purchases", { userId: user.id, productId: "dev-unpublished" })).status, 409);
    const start = await admin.post("/api/admin/test-purchases", { userId: user.id, productId: "vj-loops" });
    assert.equal(start.status, 201);
    assert.match(start.data.redirect, /^\/shop\/vj-loops$/, "opens the product it is for");
    assert.equal((await admin.get("/api/account")).data.impersonation.purpose, "test-purchase");

    const order = await mockBuy(admin, [{ productId: "vj-loops" }]);
    const row = sql(ctx.mock.stateDir, `SELECT user_id, livemode, impersonation_id, status FROM orders WHERE id = '${order.orderId}'`)[0];
    assert.deepEqual(row, { user_id: user.id, livemode: 0, impersonation_id: start.data.impersonationId, status: "paid" });
    assert.ok((await admin.get("/api/library")).data.items.some((i) => i.productId === "vj-loops"));
    await admin.post("/api/impersonation/exit", {});

    const list = await admin.get("/api/admin/test-purchases");
    assert.ok(list.data.orders.some((o) => o.id === order.orderId));
    const v = await admin.get(`/api/admin/test-purchases/${order.orderId}`);
    const byKey = Object.fromEntries(v.data.checks.map((c) => [c.key, c.ok]));
    assert.equal(byKey.test, true);
    assert.equal(byKey.paid, true);
    assert.equal(byKey.entitlements, true);
    assert.equal(byKey.library, true);
    // A customer's real order isn't a test order.
    const real = sql(ctx.mock.stateDir, `SELECT id FROM orders WHERE user_id = '${user.id}' AND impersonation_id IS NULL`)[0].id;
    assert.equal((await admin.get(`/api/admin/test-purchases/${real}`)).status, 404);
    assert.ok(fileId);
    assert.equal(sql(ctx.mock.stateDir, `SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'test_purchase.started' AND subject_user_id = '${user.id}'`)[0].n, 1);
  });

  test("an impersonated checkout never reuses the customer's own pending order, and theirs stays theirs", async () => {
    const { c, user } = await newBuyer(ctx.mock.url, "imp-pending");
    const own = await c.post("/api/checkout", { items: [{ productId: "vj-loops" }] });
    assert.equal(own.status, 201);
    const admin = await freshAdmin(ctx.mock.url);
    await impersonate(admin, user.id);
    const theirs = await admin.post("/api/checkout", { items: [{ productId: "vj-loops" }] });
    assert.equal(theirs.status, 201);
    assert.notEqual(theirs.data.orderId, own.data.orderId);
    await admin.post("/api/impersonation/exit", {});
    assert.equal(sql(ctx.mock.stateDir, `SELECT impersonation_id IS NULL AS mine FROM orders WHERE id = '${own.data.orderId}'`)[0].mine, 1);
    // The customer's next checkout reuses their own pending order, never the admin's.
    const again = await c.post("/api/checkout", { items: [{ productId: "vj-loops" }] });
    assert.equal(again.data.orderId, own.data.orderId);
    await mockOutcome(c, { orderId: own.data.orderId, sessionId: new URL(own.data.url).searchParams.get("mock") }, "expired");
  });

  test("in Stripe mode a test purchase is a Stripe test-mode order, fulfilled by the signed webhook", async () => {
    const { user } = await newBuyer(ctx.stripe.url, "imp-stripe");
    const admin = await freshAdmin(ctx.stripe.url);
    const start = await admin.post("/api/admin/test-purchases", { userId: user.id, productId: "wallpapers" });
    assert.equal(start.status, 201);
    const order = await stripeCheckout(admin, [{ productId: "wallpapers" }]);
    const { res } = await stripePay(ctx, admin, order);
    assert.equal(res.status, 200);
    const row = sql(ctx.stripe.stateDir, `SELECT livemode, provider, status, impersonation_id FROM orders WHERE id = '${order.orderId}'`)[0];
    assert.deepEqual(row, { livemode: 0, provider: "stripe", status: "paid", impersonation_id: start.data.impersonationId });
    assert.ok((await admin.get("/api/library")).data.items.some((i) => i.productId === "wallpapers"));
    await admin.post("/api/impersonation/exit", {});
  });
});

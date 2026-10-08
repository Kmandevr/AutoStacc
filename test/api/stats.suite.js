// Admin statistics and the audit log: numbers move with real data (a purchase, a sign-up, a page view), only the
// owner can read them (not customers, strangers or an impersonated customer), aggregates carry no customer details,
// every statistics query is served by an index rather than a full scan of a growing table, and catalog and admin
// changes land in the append-only audit log under the right name.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql, sqlAll } from "../support/client.js";
import { newBuyer, adminClient, freshAdmin, mockBuy } from "../support/flows.js";
import { SECTIONS } from "../../server/stats/routes.js";

const metricOf = (stats, section, id) => stats.sections.find((s) => s.id === section).metrics.find((m) => m.id === id);
const usd = (m) => (m.values.find((v) => v.currency === "USD") || { cents: 0 }).cents;
// Tables that grow with the business. A statistics query searches them through an index for its date range; only
// the all-time totals may read a whole index, and only a covering one (never the table).
const ALL_TIME = new Set(["customers.accounts", "customers.neverBought", "customers.owners"]);
const GROWING = ["orders", "order_items", "entitlements", "download_events", "user", "analytics_daily", "admin_audit", "payment_events", "impersonations"];

export default (ctx) => describe("stats", () => {
  test("only the owner reads statistics", async () => {
    const { c, user } = await newBuyer(ctx.mock.url, "stats-customer");
    const anon = new Client(ctx.mock.url);
    for (const client of [c, anon]) {
      for (const p of ["/api/admin/stats", "/api/admin/stats/sales", "/api/admin/stats/nope", "/api/admin/audit"]) assert.equal((await client.get(p)).status, 404, p);
    }
    const admin = await freshAdmin(ctx.mock.url);
    await admin.post(`/api/admin/customers/${user.id}/impersonate`, {});
    assert.equal((await admin.get("/api/admin/stats")).status, 404, "an impersonated customer is a customer");
    await admin.post("/api/impersonation/exit", {});
    assert.equal((await admin.get("/api/admin/stats")).status, 200);
    assert.equal((await admin.get("/api/admin/stats?mode=everything")).status, 400);
  });

  test("sales, customers and activity move with real data", async () => {
    const admin = await adminClient(ctx.mock.url);
    const before = (await admin.get("/api/admin/stats?mode=test")).data;
    const beforeLive = (await admin.get("/api/admin/stats?mode=live")).data;
    const { c } = await newBuyer(ctx.mock.url, "stats-buyer");
    await mockBuy(c, [{ productId: "wallpapers" }]);
    const anon = new Client(ctx.mock.url);
    await anon.post("/api/events", { event: "page_view", subject: "stats-test-page" });
    const after = (await admin.get("/api/admin/stats?mode=test")).data;

    assert.equal(metricOf(after, "sales", "paid").value, metricOf(before, "sales", "paid").value + 1);
    assert.equal(usd(metricOf(after, "sales", "revenue")), usd(metricOf(before, "sales", "revenue")) + 300);
    assert.equal(metricOf(after, "customers", "accounts").value, metricOf(before, "customers", "accounts").value + 1);
    assert.equal(metricOf(after, "activity", "page_view").value, metricOf(before, "activity", "page_view").value + 1);
    assert.ok(metricOf(after, "activity", "top-pages").rows.some(([page]) => page === "stats-test-page"));
    // The same figures straight from the orders table.
    const since = after.since + "T00:00:00.000Z";
    const db = sql(ctx.mock.stateDir, `SELECT COUNT(*) AS n, SUM(total_cents) AS cents FROM orders WHERE livemode = 0 AND status = 'paid' AND paid_at >= '${since}'`)[0];
    assert.equal(metricOf(after, "sales", "paid").value, db.n);
    assert.equal(usd(metricOf(after, "sales", "revenue")), db.cents);
    // Test orders are never live revenue.
    assert.equal(usd(metricOf(beforeLive, "sales", "revenue")), 0);
    assert.equal(after.mode, "test");
    // Sources are labelled: money from payments, views approximate, rates estimates.
    assert.equal(metricOf(after, "sales", "revenue").source, "payment");
    assert.equal(metricOf(after, "activity", "page_view").source, "activity");
    assert.equal(metricOf(after, "sales", "aov").source, "derived");
  });

  test("an admin browsing as a customer isn't counted as a visitor or a customer download", async () => {
    const admin = await adminClient(ctx.mock.url);
    const subject = "stats-imp-page";
    const { user } = await newBuyer(ctx.mock.url, "stats-imp");
    const imp = await freshAdmin(ctx.mock.url);
    await imp.post(`/api/admin/customers/${user.id}/impersonate`, {});
    assert.equal((await imp.post("/api/events", { event: "page_view", subject })).status, 202);
    await imp.post("/api/impersonation/exit", {});
    const s = (await admin.get("/api/admin/stats/activity")).data;
    assert.ok(!metricOf(s, "activity", "top-pages").rows.some(([page]) => page === subject));
  });

  test("statistics carry no customer details", async () => {
    const admin = await adminClient(ctx.mock.url);
    const { c, user } = await newBuyer(ctx.mock.url, "stats-private");
    await mockBuy(c, [{ productId: "wallpapers" }]);
    const text = JSON.stringify((await admin.get("/api/admin/stats?days=365")).data);
    assert.ok(!text.includes("@"), "no email addresses");
    assert.ok(!text.includes(user.id), "no account ids");
    assert.ok(!/ord_[a-z2-7]{10}/.test(text), "no order ids");
  });

  test("every statistics query is served by an index, not a scan of a growing table", () => {
    const all = SECTIONS.flatMap((s) => Object.entries(s.queries || {}).map(([name, q]) => [`${s.id}.${name}`, q]));
    assert.ok(all.length >= 20, "sections export their queries");
    const plans = sqlAll(ctx.mock.stateDir, all.map(([, q]) => `EXPLAIN QUERY PLAN ${q.replace(/\?/g, "1")}`).join(";\n"));
    assert.equal(plans.length, all.length);
    for (const [i, [name]] of all.entries()) {
      const plan = plans[i].map((r) => r.detail);
      const growing = (d) => GROWING.some((t) => new RegExp(`^SCAN ${t}\\b`).test(d)) || /^SCAN (u|o|i|e|d|a)\b/.test(d);
      const scans = plan.filter((d) => /^SCAN /.test(d) && growing(d) && !(ALL_TIME.has(name) && /USING COVERING INDEX/.test(d)));
      assert.deepEqual(scans, [], `${name}: ${plan.join(" | ")}`);
    }
  });

  test("catalog and admin changes are in the audit log, under the right name", async () => {
    const admin = await adminClient(ctx.mock.url);
    sql(ctx.mock.stateDir, "UPDATE products SET price_cents = price_cents + 1 WHERE id = 'dev-paused'");
    sql(ctx.mock.stateDir, "UPDATE products SET published = 1 - published WHERE id = 'dev-unpublished'");
    assert.equal((await admin.req("PATCH", "/api/admin/products/vj-loops", { body: { salesPaused: true } })).status, 200);
    assert.equal((await admin.req("PATCH", "/api/admin/products/vj-loops", { body: { salesPaused: false } })).status, 200);
    const log = (await admin.get("/api/admin/audit?action=product")).data.entries;
    const price = log.find((e) => e.action === "product.price_changed" && e.targetId === "dev-paused");
    assert.equal(price.actor, "catalog sync");
    assert.equal(price.detail.toCents, price.detail.fromCents + 1);
    assert.ok(log.some((e) => /^product\.(un)?published$/.test(e.action) && e.targetId === "dev-unpublished"));
    const paused = log.find((e) => e.action === "product.sales_paused" && e.targetId === "vj-loops");
    assert.equal(paused.actor, "admin@autostacc.test");
    // Signing in as the owner is recorded; a customer signing in is not.
    await freshAdmin(ctx.mock.url);
    const { user } = await newBuyer(ctx.mock.url, "stats-signin");
    const signins = (await admin.get("/api/admin/audit?action=admin")).data.entries;
    assert.ok(signins.some((e) => e.action === "admin.signed_in" && e.actor === "admin@autostacc.test"));
    assert.ok(!signins.some((e) => e.actor === user.email));
    // Nothing secret in any entry.
    const everything = JSON.stringify((await admin.get("/api/admin/audit?limit=200")).data);
    for (const secret of ["admin-password-123", "correct-horse-battery", "whsec_", "sk_test", '"password"', "/api/downloads/ey"]) {
      assert.ok(!everything.includes(secret), `no ${secret} in the audit log`);
    }
  });
});

// Paid creator storage (server/billing/; docs/creators.md "Paid storage"): off until the owner sets a rate and turns it
// on; a creator's chosen limit raises only their upload quota; what's stored is counted once (shared originals,
// several products, retired files) and measured once a day; a month's statement is issued once, from the days measured,
// with the card minimum carried; paying goes through a verified event matching the statement (amount, session, mode),
// once per event; an unpaid statement past its grace withdraws the paid limit without touching files; waivers and
// refunds are audited; other creators and members who aren't the owner see nothing of it. The rate used here is the
// owner's proposal ($0.05 per GB-month), for tests only. Each test makes its own creators; the switches go back off.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Client, sql, outbox, sendWebhook, linkIn } from "../support/client.js";
import { adminClient, newBuyer, sessionEvent } from "../support/flows.js";
import { WEBHOOK_SECRET } from "../support/servers.js";
import { SWEEP_TOKEN } from "./packs.suite.js";

const MB = 1024 ** 2, GB = 1024 ** 3;
const RATE = 500;
const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const prevPeriod = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
const daysIn = (p) => { const [y, m] = p.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const hex = () => crypto.randomBytes(32).toString("hex");

export default (ctx) => describe("paid creator storage", () => {
  const stores = () => [ctx.mock, ctx.stripe].filter(Boolean);
  const db = (store, q) => sql(store.stateDir, q);
  const sweep = async (store) => (await fetch(`${store.url}/api/internal/sweep`, { method: "POST", headers: { Authorization: `Bearer ${SWEEP_TOKEN}` } })).json();
  const setBilling = async (store, body) => (await adminClient(store.url)).req("PUT", "/api/admin/storage-billing", { body });

  async function creator(store, tag, products = 0) {
    const { c, user } = await newBuyer(store.url, tag);
    const cr = (await c.post("/api/studio/creators", { name: `Store ${tag}`, slug: slug(tag) })).data.creator;
    const pr = (await c.post(`/api/studio/creators/${cr.id}/projects`, { name: "Kits", slug: "kits" })).data.project;
    const made = [];
    for (let i = 0; i < products; i++) {
      made.push((await c.post(`/api/studio/projects/${pr.id}/products`, { title: `Kit ${i + 1}`, type: "sample-pack", priceCents: 1500, description: "Drums.", includes: ["kicks"] })).data.product);
    }
    // A small free allowance, so a few MB of fixtures are over it (an admin-set quota is the creator's free storage).
    db(store, `UPDATE creators SET storage_quota_bytes = ${10 * MB} WHERE id = '${cr.id}'`);
    return { c, user, creator: cr, products: made, api: `/api/studio/creators/${cr.id}/storage` };
  }
  // A stored original of this creator, as the Pack Builder would record it, optionally delivered by products.
  function original(store, creatorId, bytes, productIds = []) {
    const id = `bl_t${crypto.randomBytes(8).toString("hex")}`;
    db(store, `INSERT INTO blobs (id, owner_scope, sha256, crc32, size_bytes, r2_key, created_at) VALUES ('${id}', '${creatorId}', '${hex()}', 0, ${bytes}, 'test/${id}', 'x')`);
    for (const p of productIds) {
      db(store, `INSERT INTO product_files (id, product_id, r2_key, filename, size_bytes, active, created_at, status, blob_id, asset_id)
        VALUES ('pf_t${crypto.randomBytes(8).toString("hex")}', '${p}', 'blob/t${crypto.randomBytes(8).toString("hex")}', 'kick.wav', ${bytes}, 1, 'x', 'published', '${id}', 'as_t${crypto.randomBytes(4).toString("hex")}')`);
    }
    return id;
  }
  // Last month, measured every day at this much over the allowance (what the daily sweep would have recorded).
  function lastMonth(store, creatorId, billable, { days, rate = RATE } = {}) {
    const p = prevPeriod();
    const n = days ?? daysIn(p);
    for (let d = 1; d <= n; d++) {
      db(store, `INSERT INTO storage_usage_days (creator_id, day, used_bytes, included_bytes, billable_bytes, rate, by_part, measured_at)
        VALUES ('${creatorId}', '${p}-${String(d).padStart(2, "0")}', ${billable + 10 * MB}, ${10 * MB}, ${billable}, ${rate === null ? "NULL" : rate}, '{}', 'x')`);
    }
    return p;
  }
  const statement = (store, creatorId, period) => db(store, `SELECT * FROM storage_statements WHERE creator_id = '${creatorId}' AND period = '${period}'`)[0];

  before(async () => { for (const s of stores()) await setBilling(s, { state: "off", rate: null }); });
  after(async () => { for (const s of stores()) await setBilling(s, { state: "off", rate: null }); });

  test("off by default: no plan without the owner's rate; only admins change the switches, audited", async () => {
    const o = await creator(ctx.mock, "sb-off");
    const got = await o.c.get(o.api);
    assert.equal(got.status, 200);
    assert.equal(got.data.billing.available, false);
    assert.equal(got.data.billing.rate, null, "no price in code");
    assert.equal((await o.c.req("PUT", `${o.api}/plan`, { body: { capGb: 2 } })).data.error.code, "storage_billing_off");
    assert.equal((await o.c.req("PUT", "/api/admin/storage-billing", { body: { state: "on", rate: 1 } })).status, 404, "customers can't");
    assert.equal((await setBilling(ctx.mock, { state: "on" })).data.error.code, "rate_unset");
    assert.equal((await setBilling(ctx.mock, { rate: 0 })).status, 400);
    const on = await setBilling(ctx.mock, { state: "on", rate: RATE });
    assert.equal(on.status, 200);
    assert.deepEqual([on.data.settings.on, on.data.settings.rate], [true, RATE]);
    assert.ok(db(ctx.mock, "SELECT COUNT(*) AS n FROM admin_audit WHERE action IN ('storage_billing.on', 'storage_billing.rate_set')")[0].n >= 2);
  });

  test("what's stored is counted once: a shared original, two products, a site and the total all agree", async () => {
    const o = await creator(ctx.mock, "sb-count", 2);
    original(ctx.mock, o.creator.id, 3 * MB, [o.products[0].id, o.products[1].id]);
    original(ctx.mock, o.creator.id, 1 * MB, [o.products[0].id]);
    original(ctx.mock, o.creator.id, 2 * MB); // a draft's file, not delivered yet
    const s = (await o.c.get(o.api)).data.storage;
    assert.equal(s.byPart.originals, 6 * MB);
    assert.equal(s.usedBytes, 6 * MB, "the 3 MB file two products deliver counts once");
    assert.equal(Object.values(s.byPart).reduce((a, b) => a + b, 0), s.usedBytes);
    const list = (await o.c.get("/api/studio")).data.creators.find((x) => x.id === o.creator.id);
    assert.equal(list.storage.usedBytes, s.usedBytes, "the Studio's other figure is the same measure");
  });

  test("a plan raises only this creator's upload limit; lowering it or cancelling stops new uploads, never files", async () => {
    await setBilling(ctx.mock, { state: "on", rate: RATE });
    const o = await creator(ctx.mock, "sb-plan");
    for (const bad of [0, 1.5, "2", 10000]) assert.equal((await o.c.req("PUT", `${o.api}/plan`, { body: { capGb: bad } })).status, 400, String(bad));
    const up = await o.c.req("PUT", `${o.api}/plan`, { body: { capGb: 2 } });
    assert.equal(up.status, 200, JSON.stringify(up.data));
    assert.equal((await o.c.get(o.api)).data.storage.quotaBytes, 2 * GB);
    assert.equal((await o.c.req("PUT", `${o.api}/plan`, { body: { capGb: 5 } })).data.plan.capBytes, 5 * GB, "upgrade");
    original(ctx.mock, o.creator.id, 12 * MB);
    assert.equal((await o.c.req("PUT", `${o.api}/plan`, { body: { capGb: 1 } })).status, 200, "downgrade, still above what's stored");
    const cancel = await o.c.req("DELETE", `${o.api}/plan`, { body: {} });
    assert.equal(cancel.data.plan.status, "cancelled");
    const after = (await o.c.get(o.api)).data.storage;
    assert.equal(after.quotaBytes, 10 * MB, "back to the free storage");
    assert.equal(after.usedBytes, 12 * MB, "nothing was deleted");
    // Over the free storage now: a new upload is refused.
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a60000000049454e44ae426082", "hex");
    const put = await o.c.req("PUT", `/api/studio/creators/${o.creator.id}/images?filename=a.png`, { raw: png, headers: { "Content-Type": "image/png" } });
    assert.equal(put.data.error.code, "quota_exceeded");
    const actions = (await o.c.get(o.api)).data.log.map((l) => l.action);
    for (const a of ["plan.started", "plan.changed", "plan.cancelled"]) assert.ok(actions.includes(a), a);
  });

  test("measured once a day; a cancelled plan is still charged above the allowance until it's back under, then ends", async () => {
    await setBilling(ctx.mock, { state: "on", rate: RATE });
    const o = await creator(ctx.mock, "sb-measure");
    await o.c.req("PUT", `${o.api}/plan`, { body: { capGb: 2 } });
    const big = original(ctx.mock, o.creator.id, 14 * MB);
    await o.c.req("DELETE", `${o.api}/plan`, { body: {} });
    await sweep(ctx.mock);
    await sweep(ctx.mock);
    const today = new Date().toISOString().slice(0, 10);
    const days = db(ctx.mock, `SELECT * FROM storage_usage_days WHERE creator_id = '${o.creator.id}'`);
    assert.equal(days.length, 1, "one measurement a day");
    assert.deepEqual([days[0].day, days[0].used_bytes, days[0].included_bytes, days[0].billable_bytes, days[0].rate], [today, 14 * MB, 10 * MB, 4 * MB, RATE]);
    assert.equal(JSON.parse(days[0].by_part).originals, 14 * MB);
    assert.equal((await o.c.get(o.api)).data.plan.status, "cancelled");
    // Back under the allowance (the creator deleted the file): the next day's measurement ends the plan.
    db(ctx.mock, `DELETE FROM blobs WHERE id = '${big}'; DELETE FROM storage_usage_days WHERE creator_id = '${o.creator.id}'`);
    await sweep(ctx.mock);
    assert.equal((await o.c.get(o.api)).data.plan.status, "ended");
  });

  test("a month's statement is issued once, from its measured days; small amounts carry into the next", async () => {
    await setBilling(ctx.mock, { state: "on", rate: RATE });
    const o = await creator(ctx.mock, "sb-issue");
    await o.c.req("PUT", `${o.api}/plan`, { body: { capGb: 50 } });
    const p = lastMonth(ctx.mock, o.creator.id, 30 * GB);
    await sweep(ctx.mock);
    await sweep(ctx.mock);
    const s = statement(ctx.mock, o.creator.id, p);
    assert.deepEqual([s.status, s.usage_cents, s.amount_cents, s.days_measured], ["open", 150, 150, daysIn(p)], "30 GB-months at 5¢");
    assert.equal(db(ctx.mock, `SELECT COUNT(*) AS n FROM storage_statements WHERE creator_id = '${o.creator.id}'`)[0].n, 1);
    assert.equal(db(ctx.mock, `SELECT COUNT(*) AS n FROM storage_billing_log WHERE creator_id = '${o.creator.id}' AND action = 'statement.issued'`)[0].n, 1);
    assert.equal((await outbox(ctx.mock.url, o.user.email)).filter((m) => m.kind === "storage-billing").length, 1, "the owner is told once");
    // The creator can check every day behind it.
    const detail = await o.c.get(`${o.api}/statements/${s.id}`);
    assert.equal(detail.data.days.length, daysIn(p));
    assert.equal(detail.data.days.reduce((a, d) => a + d.billableBytes, 0), s.billable_byte_days);

    // 6 GB for 10 days = under 50¢: carried, and added to the month after.
    const small = await creator(ctx.mock, "sb-carry");
    await small.c.req("PUT", `${small.api}/plan`, { body: { capGb: 50 } });
    const pp = lastMonth(ctx.mock, small.creator.id, 6 * GB, { days: 10 });
    await sweep(ctx.mock);
    const carried = statement(ctx.mock, small.creator.id, pp);
    assert.equal(carried.status, "carried");
    assert.ok(carried.amount_cents > 0 && carried.amount_cents < 50);
  });

  test("paying: only a matching event pays, once; a failed payment leaves it open; other creators can't see or pay it", async () => {
    await setBilling(ctx.mock, { state: "on", rate: RATE });
    const o = await creator(ctx.mock, "sb-pay");
    await o.c.req("PUT", `${o.api}/plan`, { body: { capGb: 50 } });
    const s = statement(ctx.mock, o.creator.id, (lastMonth(ctx.mock, o.creator.id, 30 * GB), await sweep(ctx.mock), prevPeriod()));
    const stranger = await creator(ctx.mock, "sb-stranger");
    assert.equal((await stranger.c.get(`/api/studio/creators/${o.creator.id}/storage`)).status, 404);
    assert.equal((await stranger.c.get(`${stranger.api}/statements/${s.id}`)).status, 404, "not through their own creator either");
    assert.equal((await stranger.c.post(`${stranger.api}/statements/${s.id}/checkout`, {})).status, 404);
    const co = await o.c.post(`${o.api}/statements/${s.id}/checkout`, {});
    assert.equal(co.status, 201, JSON.stringify(co.data));
    const sessionId = new URL(co.data.url.replace("#", "?")).searchParams.get("mock");
    const play = (body) => o.c.post("/api/dev/mock-storage-payment", { statementId: s.id, sessionId, ...body });
    assert.equal((await play({ outcome: "failed" })).data.outcome, "storage payment failed");
    assert.equal(statement(ctx.mock, o.creator.id, s.period).status, "open");
    assert.equal((await play({ outcome: "paid", amountCents: 1 })).data.outcome, "rejected", "wrong amount");
    assert.equal(statement(ctx.mock, o.creator.id, s.period).status, "open");
    const eventId = `mock_evt_sb_${Date.now()}`;
    assert.equal((await play({ outcome: "paid", eventId })).data.outcome, "storage statement paid");
    assert.equal((await play({ outcome: "paid", eventId })).data.outcome, "duplicate");
    assert.equal((await play({ outcome: "paid" })).data.outcome, "already paid");
    assert.equal(statement(ctx.mock, o.creator.id, s.period).status, "paid");
    assert.equal((await o.c.post(`${o.api}/statements/${s.id}/checkout`, {})).data.error.code, "not_payable");
    assert.equal(db(ctx.mock, `SELECT COUNT(*) AS n FROM storage_billing_log WHERE statement_id = '${s.id}' AND action = 'payment.succeeded'`)[0].n, 1);
  });

  test("unpaid past the grace period: the paid limit pauses, files stay; paying restores it", async () => {
    await setBilling(ctx.mock, { state: "on", rate: RATE });
    const o = await creator(ctx.mock, "sb-late");
    await o.c.req("PUT", `${o.api}/plan`, { body: { capGb: 50 } });
    const file = original(ctx.mock, o.creator.id, 12 * MB);
    lastMonth(ctx.mock, o.creator.id, 30 * GB);
    await sweep(ctx.mock);
    const s = statement(ctx.mock, o.creator.id, prevPeriod());
    db(ctx.mock, `UPDATE storage_statements SET due_at = '2000-01-01T00:00:00.000Z' WHERE id = '${s.id}'`);
    await sweep(ctx.mock);
    let got = (await o.c.get(o.api)).data;
    assert.equal(got.plan.status, "past_due");
    assert.equal(got.storage.quotaBytes, 10 * MB, "uploads stop above the free storage");
    assert.equal(db(ctx.mock, `SELECT COUNT(*) AS n FROM blobs WHERE id = '${file}'`)[0].n, 1, "nothing deleted");
    assert.equal((await o.c.req("PUT", `${o.api}/plan`, { body: { capGb: 100 } })).data.error.code, "storage_past_due");
    const co = await o.c.post(`${o.api}/statements/${s.id}/checkout`, {});
    const sessionId = new URL(co.data.url.replace("#", "?")).searchParams.get("mock");
    await o.c.post("/api/dev/mock-storage-payment", { statementId: s.id, sessionId, outcome: "paid" });
    got = (await o.c.get(o.api)).data;
    assert.deepEqual([got.plan.status, got.storage.quotaBytes], ["active", 50 * GB]);
    assert.ok((await outbox(ctx.mock.url, o.user.email)).some((m) => m.kind === "storage-billing" && /overdue/.test(m.subject)));
  });

  test("members who aren't the owner see storage, not billing; AutoStacc can waive, audited and in the creator's log", async () => {
    await setBilling(ctx.mock, { state: "on", rate: RATE });
    const o = await creator(ctx.mock, "sb-team");
    await o.c.req("PUT", `${o.api}/plan`, { body: { capGb: 50 } });
    const m = await newBuyer(ctx.mock.url, "sb-member");
    await o.c.post(`/api/studio/creators/${o.creator.id}/invites`, { email: m.user.email, role: "admin" });
    const token = new URL(linkIn((await outbox(ctx.mock.url, m.user.email)).find((x) => x.kind === "creator-invite"))).hash.replace("#invite=", "");
    await m.c.post("/api/studio/invites/accept", { token });
    const seen = (await m.c.get(o.api)).data;
    assert.ok(seen.storage && !seen.billing && !seen.statements, "storage only");
    assert.equal((await m.c.req("PUT", `${o.api}/plan`, { body: { capGb: 100 } })).status, 404);
    assert.equal((await m.c.req("DELETE", `${o.api}/plan`, { body: {} })).status, 404);
    lastMonth(ctx.mock, o.creator.id, 30 * GB);
    await sweep(ctx.mock);
    const s = statement(ctx.mock, o.creator.id, prevPeriod());
    assert.equal((await m.c.post(`${o.api}/statements/${s.id}/checkout`, {})).status, 404);
    const admin = await adminClient(ctx.mock.url);
    assert.equal((await admin.post(`/api/admin/storage-billing/statements/${s.id}/waive`, {})).status, 400, "a note is required");
    const w = await admin.post(`/api/admin/storage-billing/statements/${s.id}/waive`, { note: "Goodwill credit" });
    assert.equal(w.status, 200);
    assert.equal(statement(ctx.mock, o.creator.id, s.period).status, "waived");
    assert.equal((await admin.post(`/api/admin/storage-billing/statements/${s.id}/waive`, { note: "again" })).data.error.code, "not_waivable");
    assert.equal(db(ctx.mock, `SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'storage_billing.waived' AND target_id = '${s.id}'`)[0].n, 1);
    assert.ok((await o.c.get(o.api)).data.log.some((l) => l.action === "statement.waived"));
    const view = (await admin.get(`/api/admin/storage-billing/creators/${o.creator.id}?period=${s.period}`)).data;
    assert.equal(view.days.length, daysIn(s.period));
    assert.ok((await admin.get("/api/admin/storage-billing")).data.plans.some((p) => p.creatorId === o.creator.id));
    assert.equal((await m.c.get("/api/admin/storage-billing")).status, 404);
  });

  test("Stripe: the main account's signed event pays it; a replay changes nothing; a refund goes to Stripe once", async () => {
    if (!ctx.stripe) return;
    await setBilling(ctx.stripe, { state: "on", rate: RATE });
    const o = await creator(ctx.stripe, "sb-stripe");
    await o.c.req("PUT", `${o.api}/plan`, { body: { capGb: 50 } });
    lastMonth(ctx.stripe, o.creator.id, 30 * GB);
    await sweep(ctx.stripe);
    const s = statement(ctx.stripe, o.creator.id, prevPeriod());
    const co = await o.c.post(`${o.api}/statements/${s.id}/checkout`, {});
    assert.equal(co.status, 201, JSON.stringify(co.data));
    const sessionId = co.data.url.split("/pay/")[1];
    const made = ctx.stripe.fake.created.find((x) => x.session.id === sessionId);
    assert.equal(made.form.metadata.storage_statement_id, s.id);
    assert.equal(Number(made.form.line_items[0].price_data.unit_amount), 150);
    assert.match(made.form.line_items[0].price_data.product_data.tax_code, /^txcd_\d+$/);
    const client = new Client(ctx.stripe.url);
    const forged = sessionEvent("checkout.session.completed", { ...ctx.stripe.fake.sessions.get(sessionId), payment_status: "paid", amount_subtotal: 1, payment_intent: "pi_forged" });
    assert.equal((await sendWebhook(client, forged, WEBHOOK_SECRET)).data.outcome, "rejected");
    assert.equal(statement(ctx.stripe, o.creator.id, s.period).status, "open");
    const paid = sessionEvent("checkout.session.completed", ctx.stripe.fake.pay(sessionId));
    assert.equal((await sendWebhook(client, paid, WEBHOOK_SECRET)).data.outcome, "storage statement paid");
    assert.equal((await sendWebhook(client, paid, WEBHOOK_SECRET)).data.outcome, "duplicate");
    const row = statement(ctx.stripe, o.creator.id, s.period);
    assert.equal(row.status, "paid");
    const admin = await adminClient(ctx.stripe.url);
    const sent = ctx.stripe.fake.refunds.length;
    assert.equal((await admin.post(`/api/admin/storage-billing/statements/${s.id}/refund`, { note: "Billing error" })).status, 200);
    assert.equal(ctx.stripe.fake.refunds.length, sent + 1);
    assert.equal(ctx.stripe.fake.refunds.at(-1).payment_intent, row.provider_payment_id);
    assert.equal(statement(ctx.stripe, o.creator.id, s.period).status, "refunded");
    // Stripe's own refund event afterwards finds nothing more to do.
    const refunded = { id: `evt_sb_${Date.now()}`, object: "event", type: "charge.refunded", livemode: false, created: Math.floor(Date.now() / 1000),
      data: { object: { refunded: true, amount_refunded: 150, currency: "usd", payment_intent: row.provider_payment_id } } };
    assert.equal((await sendWebhook(client, refunded, WEBHOOK_SECRET)).status, 200);
    assert.equal(statement(ctx.stripe, o.creator.id, s.period).refunded_cents, 150);
    assert.equal((await admin.post(`/api/admin/storage-billing/statements/${s.id}/refund`, { note: "twice" })).data.error.code, "not_refundable");
  });
});

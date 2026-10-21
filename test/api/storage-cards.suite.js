// Paid creator storage, saved cards and automatic charges (server/billing/cards.js, charges.js; docs/creators.md
// "Paid storage"; #142): the owner saves a card on a setup-mode Checkout on the main account (card details stay at
// Stripe; AutoStacc keeps the customer, the payment method, brand and last 4), recorded only from a verified event or a
// server-side lookup; the sweep charges an open statement off-session once per try (days 0, 3, 7, 12; two sweeps at once
// charge once), a decline emails the owner and retries, a bank asking the owner to confirm (SCA) stops the tries and
// leaves the pay page; 14 days unpaid pauses the paid limit, nothing deleted; payment only from a verified event for the
// main account, its mode and amount, once. Replacing a card detaches the old one; removing it falls back to the pay
// page. Only the owner, never a support impersonation. The switches go back off.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client, sql, outbox, sendWebhook, linkIn } from "../support/client.js";
import { adminClient, freshAdmin, newBuyer, sessionEvent } from "../support/flows.js";
import { WEBHOOK_SECRET, MARKETPLACE_WEBHOOK_SECRET } from "../support/servers.js";
import { SWEEP_TOKEN } from "./packs.suite.js";

const MB = 1024 ** 2, GB = 1024 ** 3, DAY = 86400000;
const RATE = 500;
const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const prevPeriod = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
const daysIn = (p) => { const [y, m] = p.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const ISO = "'%Y-%m-%dT%H:%M:%fZ'";

export default (ctx) => describe("paid storage: saved cards and automatic charges", () => {
  const stores = () => [ctx.mock, ctx.stripe].filter(Boolean);
  const db = (store, q) => sql(store.stateDir, q);
  const sweep = async (store) => (await fetch(`${store.url}/api/internal/sweep`, { method: "POST", headers: { Authorization: `Bearer ${SWEEP_TOKEN}` } })).json();
  const setBilling = async (store, body) => (await adminClient(store.url)).req("PUT", "/api/admin/storage-billing", { body });
  const fake = () => ctx.stripe.fake;
  const hook = (event, account = "main") => sendWebhook(new Client(ctx.stripe.url), event, account === "main" ? WEBHOOK_SECRET : MARKETPLACE_WEBHOOK_SECRET,
    undefined, account === "main" ? "/api/webhooks/stripe" : "/api/webhooks/stripe-marketplace");
  const outcome = async (event, account) => (await hook(event, account)).data.outcome;

  async function creator(store, tag) {
    const { c, user } = await newBuyer(store.url, tag);
    const cr = (await c.post("/api/studio/creators", { name: `Store ${tag}`, slug: slug(tag) })).data.creator;
    db(store, `UPDATE creators SET storage_quota_bytes = ${10 * MB} WHERE id = '${cr.id}'`);
    return { c, user, creator: cr, api: `/api/studio/creators/${cr.id}/storage` };
  }
  const card = async (o) => (await o.c.get(o.api)).data.billing.card;
  const cardRow = (store, o) => db(store, `SELECT * FROM storage_cards WHERE creator_id = '${o.creator.id}'`)[0];
  // Saves a card: Stripe mode completes the setup page at the fake and sends its signed event; the mock confirms.
  async function saveCard(store, o, look = {}) {
    const r = await o.c.post(`${o.api}/card`, {});
    assert.equal(r.status, 201, JSON.stringify(r.data));
    if (store === ctx.mock) return { confirm: await o.c.post(`${o.api}/card/confirm`, {}) };
    const sessionId = r.data.url.split("/pay/")[1];
    const session = fake().completeSetup(sessionId, look);
    const event = sessionEvent("checkout.session.completed", session);
    return { sessionId, session, event, outcome: await outcome(event) };
  }
  // A creator with a $5 plan, optionally a saved card, and last month measured at 30 GB over: a $1.50 statement.
  async function billed(store, tag, { withCard = true, outcomes = [], run = true } = {}) {
    const o = await creator(store, tag);
    assert.equal((await o.c.req("PUT", `${o.api}/plan`, { body: { capCents: 500 } })).status, 200);
    if (withCard) await saveCard(store, o);
    const row = cardRow(store, o);
    if (store === ctx.stripe && row && outcomes.length) fake().chargeOutcomes(row.customer_id, ...outcomes);
    const p = prevPeriod();
    for (let d = 1; d <= daysIn(p); d++) {
      db(store, `INSERT INTO storage_usage_days (creator_id, day, used_bytes, included_bytes, billable_bytes, rate, by_part, measured_at)
        VALUES ('${o.creator.id}', '${p}-${String(d).padStart(2, "0")}', ${30 * GB + 10 * MB}, ${10 * MB}, ${30 * GB}, ${RATE}, '{}', 'x')`);
    }
    if (run) await sweep(store);
    return o;
  }
  const statement = (store, o) => db(store, `SELECT * FROM storage_statements WHERE creator_id = '${o.creator.id}' AND period = '${prevPeriod()}'`)[0];
  const chargesOf = (s) => fake().charges.filter((x) => x.form.metadata.storage_statement_id === s.id);
  // As if `days` had passed: the statement's times move back (its grace period and next try with them).
  const age = (store, s, days) => db(store, `UPDATE storage_statements SET issued_at = strftime(${ISO}, issued_at, '-${days} days'),
    due_at = strftime(${ISO}, due_at, '-${days} days'), next_charge_at = strftime(${ISO}, next_charge_at, '-${days} days') WHERE id = '${s.id}'`);
  const mails = async (store, o, re) => (await outbox(store.url, o.user.email)).filter((m) => m.kind === "storage-billing" && re.test(m.subject));
  const piEvent = (type, pi, over = {}) => ({ ...sessionEvent(type, pi), ...over });

  before(async () => { for (const s of stores()) await setBilling(s, { state: "off", rate: null }); });
  after(async () => { for (const s of stores()) await setBilling(s, { state: "off", rate: null }); });

  test("saving a card: a setup page on the main account, saved only from Stripe's verified answer, once; brand and last 4 only", async () => {
    if (!ctx.stripe) return;
    const o = await creator(ctx.stripe, "sc-save");
    assert.equal((await o.c.post(`${o.api}/card`, {})).data.error.code, "storage_billing_off");
    await setBilling(ctx.stripe, { state: "on", rate: RATE });
    const r = await o.c.post(`${o.api}/card`, {});
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const sessionId = r.data.url.split("/pay/")[1];
    const made = fake().created.find((x) => x.session.id === sessionId);
    assert.equal(made.form.mode, "setup");
    assert.equal(made.form.payment_method_types[0], "card");
    assert.equal(made.form.metadata.storage_creator_id, o.creator.id);
    assert.equal(made.form.setup_intent_data.metadata.storage_creator_id, o.creator.id);
    assert.equal(made.form.line_items, undefined, "nothing is charged here");
    assert.equal(made.key, "Bearer sk_test_fake_key_for_tests", "AutoStacc's main account, not the marketplace");
    assert.equal(fake().customers.get(made.form.customer).metadata.storage_creator_id, o.creator.id);
    assert.ok(new URL(made.form.success_url).hash.includes(`storage=${o.creator.id}&card=1`));
    // Not finished at Stripe: an event claiming it was, and the owner's lookup, save nothing.
    const early = sessionEvent("checkout.session.completed", fake().sessions.get(sessionId));
    assert.equal(await outcome(early), "rejected");
    assert.equal((await o.c.post(`${o.api}/card/confirm`, {})).data.saved, false);
    assert.equal(await card(o), null);

    const session = fake().completeSetup(sessionId, { brand: "visa", last4: "4242" });
    const event = sessionEvent("checkout.session.completed", session);
    // The wrong account or mode, or an event naming another creator: refused.
    assert.equal(await outcome({ ...event, id: `${event.id}_mk` }, "marketplace"), "rejected");
    assert.equal(await outcome({ ...event, id: `${event.id}_live`, livemode: true }), "rejected");
    const other = await creator(ctx.stripe, "sc-save-other");
    assert.equal(await outcome(sessionEvent("checkout.session.completed", { ...session, metadata: { storage_creator_id: other.creator.id } })), "rejected");
    assert.equal(db(ctx.stripe, `SELECT COUNT(*) AS n FROM storage_cards WHERE creator_id = '${other.creator.id}'`)[0].n, 0);
    assert.equal(await card(o), null);

    assert.equal(await outcome(event), "storage card saved");
    assert.equal(await outcome(event), "duplicate");
    assert.equal((await o.c.post(`${o.api}/card/confirm`, {})).data.saved, true, "the lookup after it finds it already saved");
    assert.deepEqual(await card(o), { brand: "visa", last4: "4242" });
    const row = cardRow(ctx.stripe, o);
    assert.deepEqual([row.provider, row.customer_id, row.livemode, row.brand, row.last4], ["stripe", made.form.customer, 0, "visa", "4242"]);
    assert.equal(row.payment_method_id, fake().setupIntents.get(session.setup_intent).payment_method);
    assert.ok(!Object.values(row).some((v) => /\d{12,}/.test(String(v))), "never a card number");
    const saved = db(ctx.stripe, `SELECT detail FROM storage_billing_log WHERE creator_id = '${o.creator.id}' AND action = 'card.saved'`);
    assert.equal(saved.length, 1);
    assert.deepEqual([JSON.parse(saved[0].detail).brand, JSON.parse(saved[0].detail).last4], ["visa", "4242"]);
  });

  test("an issued statement is charged off-session to the saved card, once; Stripe's event afterwards changes nothing", async () => {
    if (!ctx.stripe) return;
    await setBilling(ctx.stripe, { state: "on", rate: RATE });
    const o = await billed(ctx.stripe, "sc-charge");
    const s = statement(ctx.stripe, o);
    const row = cardRow(ctx.stripe, o);
    assert.deepEqual([s.status, s.amount_cents, s.charge_status, s.charge_attempts, s.provider, s.next_charge_at], ["paid", 150, "succeeded", 1, "stripe", null]);
    const [ch] = chargesOf(s);
    assert.equal(chargesOf(s).length, 1);
    assert.deepEqual([ch.form.amount, ch.form.currency, ch.form.customer, ch.form.payment_method, ch.form.off_session, ch.form.confirm],
      ["150", "usd", row.customer_id, row.payment_method_id, "true", "true"]);
    assert.deepEqual([ch.form.metadata.storage_charge_attempt, ch.idem, ch.key], ["1", `storage-charge-${s.id}-1`, "Bearer sk_test_fake_key_for_tests"]);
    assert.equal(s.provider_payment_id, ch.id);
    assert.equal((await o.c.get(o.api)).data.plan.status, "active");
    const issued = await mails(ctx.stripe, o, /storage statement for/);
    assert.ok(issued.some((m) => /Visa ending 4242/.test(m.body_text)), "the owner is told which card is charged");
    const ev = piEvent("payment_intent.succeeded", fake().intents.get(ch.id));
    assert.equal(await outcome(ev), "already paid");
    assert.equal(await outcome(ev), "duplicate");
    await sweep(ctx.stripe);
    assert.equal(chargesOf(s).length, 1, "a paid statement is never charged again");
    assert.equal(db(ctx.stripe, `SELECT COUNT(*) AS n FROM storage_billing_log WHERE statement_id = '${s.id}' AND action = 'payment.succeeded'`)[0].n, 1);
  });

  test("a declined card is retried on days 0, 3, 7 and 12 with an email each time; 14 days unpaid pauses the limit, nothing is deleted", async () => {
    if (!ctx.stripe) return;
    await setBilling(ctx.stripe, { state: "on", rate: RATE });
    const o = await billed(ctx.stripe, "sc-decline", { outcomes: ["declined", "declined", "declined", "declined"] });
    let s = statement(ctx.stripe, o);
    assert.deepEqual([s.status, s.charge_status, s.charge_error, s.charge_attempts], ["open", "declined", "insufficient_funds", 1]);
    assert.equal(Date.parse(s.next_charge_at) - Date.parse(s.issued_at), 3 * DAY);
    // Stripe's own failure event for the same try changes nothing more, and mails nothing more.
    const failed = piEvent("payment_intent.payment_failed", fake().intents.get(chargesOf(s)[0].id));
    assert.equal(await outcome(failed), "storage charge failure already recorded");
    assert.equal(await outcome(failed), "duplicate");
    await sweep(ctx.stripe);
    assert.equal(chargesOf(s).length, 1, "not again before its day");
    const onDay = [Math.round((Date.now() - Date.parse(s.issued_at)) / DAY)];
    for (const gap of [3, 4, 5]) {
      age(ctx.stripe, s, gap);
      await sweep(ctx.stripe);
      s = statement(ctx.stripe, o);
      onDay.push(Math.round((Date.now() - Date.parse(s.issued_at)) / DAY));
    }
    assert.deepEqual(onDay, [0, 3, 7, 12]);
    assert.deepEqual(chargesOf(s).map((c) => c.idem), [1, 2, 3, 4].map((n) => `storage-charge-${s.id}-${n}`));
    assert.deepEqual([s.charge_attempts, s.charge_status, s.next_charge_at, s.status], [4, "declined", null, "open"]);
    const told = await mails(ctx.stripe, o, /couldn't charge your card/);
    assert.equal(told.length, 4);
    assert.ok(told.every((m) => linkIn(m).includes(`/studio#storage=${o.creator.id}`)), "a link to update the card or pay");
    assert.equal((await o.c.get(o.api)).data.plan.status, "active", "still inside the grace period");
    age(ctx.stripe, s, 3);
    await sweep(ctx.stripe);
    assert.equal(chargesOf(s).length, 4, "no fifth try");
    const got = (await o.c.get(o.api)).data;
    assert.deepEqual([got.plan.status, got.storage.quotaBytes], ["past_due", 10 * MB], "uploads stop above the free storage");
    assert.deepEqual(await card(o), { brand: "visa", last4: "4242" }, "the card is kept for paying");
    assert.equal(statement(ctx.stripe, o).status, "open", "still payable on the pay page");
  });

  test("a bank asking the owner to confirm (SCA) stops the automatic tries; the owner pays on the pay page", async () => {
    if (!ctx.stripe) return;
    await setBilling(ctx.stripe, { state: "on", rate: RATE });
    const o = await billed(ctx.stripe, "sc-sca", { outcomes: ["requires_action"] });
    let s = statement(ctx.stripe, o);
    assert.deepEqual([s.status, s.charge_status, s.next_charge_at, s.charge_attempts], ["open", "requires_action", null, 1]);
    const asked = await mails(ctx.stripe, o, /bank wants you to confirm/);
    assert.equal(asked.length, 1);
    assert.ok(linkIn(asked[0]).includes(`/studio#storage=${o.creator.id}`));
    age(ctx.stripe, s, 3);
    await sweep(ctx.stripe);
    assert.equal(chargesOf(s).length, 1, "off-session tries can't pass the bank's check");
    const co = await o.c.post(`${o.api}/statements/${s.id}/checkout`, {});
    assert.equal(co.status, 201, JSON.stringify(co.data));
    const paid = sessionEvent("checkout.session.completed", fake().pay(co.data.url.split("/pay/")[1]));
    assert.equal(await outcome(paid), "storage statement paid");
    s = statement(ctx.stripe, o);
    assert.equal(s.status, "paid");
  });

  test("a charge still processing: the pay page waits; only a verified event for the main account, its mode and amount pays it, once", async () => {
    if (!ctx.stripe) return;
    await setBilling(ctx.stripe, { state: "on", rate: RATE });
    const o = await billed(ctx.stripe, "sc-processing", { outcomes: ["processing"] });
    const s = statement(ctx.stripe, o);
    assert.deepEqual([s.status, s.charge_status], ["open", "processing"]);
    assert.equal((await o.c.post(`${o.api}/statements/${s.id}/checkout`, {})).data.error.code, "charge_in_progress");
    const pi = fake().settleIntent(chargesOf(s)[0].id, "succeeded");
    const ev = piEvent("payment_intent.succeeded", pi);
    assert.equal(await outcome({ ...ev, id: `${ev.id}_mk` }, "marketplace"), "rejected", "the wrong account");
    assert.equal(await outcome({ ...ev, id: `${ev.id}_live`, livemode: true }), "rejected", "the wrong mode");
    assert.equal(await outcome(piEvent("payment_intent.succeeded", { ...pi, amount: 1, amount_received: 1 })), "rejected", "the wrong amount");
    const unmarked = { ...pi, metadata: { storage_statement_id: s.id } };
    assert.equal(await outcome(piEvent("payment_intent.succeeded", unmarked)), "ignored", "a pay page's own PaymentIntent pays through Checkout's event");
    assert.equal(statement(ctx.stripe, o).status, "open");
    assert.equal(await outcome(ev), "storage statement paid");
    assert.equal(await outcome(ev), "duplicate");
    assert.equal(await outcome(piEvent("payment_intent.succeeded", pi)), "already paid");
    assert.deepEqual([statement(ctx.stripe, o).status, statement(ctx.stripe, o).charge_status], ["paid", "succeeded"]);

    // A processing charge that fails later: Stripe's event records it once and the owner is told.
    const f = await billed(ctx.stripe, "sc-processing-fail", { outcomes: ["processing"] });
    const fs = statement(ctx.stripe, f);
    const bad = fake().settleIntent(chargesOf(fs)[0].id, "declined");
    assert.equal(await outcome(piEvent("payment_intent.payment_failed", { ...bad, metadata: { ...bad.metadata, storage_charge_attempt: "7" } })), "no change", "not this try");
    assert.equal(await outcome(piEvent("payment_intent.payment_failed", bad)), "storage charge declined");
    assert.equal(await outcome(piEvent("payment_intent.payment_failed", bad)), "storage charge failure already recorded");
    assert.deepEqual([statement(ctx.stripe, f).charge_status, statement(ctx.stripe, f).charge_error], ["declined", "generic_decline"]);
    assert.equal((await mails(ctx.stripe, f, /couldn't charge your card/)).length, 1);
  });

  test("two sweeps at once charge a statement once", async () => {
    if (!ctx.stripe) return;
    await setBilling(ctx.stripe, { state: "on", rate: RATE });
    const paid = await billed(ctx.stripe, "sc-race", { run: false });
    const declined = await billed(ctx.stripe, "sc-race-declined", { run: false, outcomes: ["declined", "declined"] });
    await Promise.all([sweep(ctx.stripe), sweep(ctx.stripe), sweep(ctx.stripe)]);
    const a = statement(ctx.stripe, paid), b = statement(ctx.stripe, declined);
    assert.deepEqual([chargesOf(a).length, a.charge_attempts, a.status], [1, 1, "paid"]);
    assert.deepEqual([chargesOf(b).length, b.charge_attempts, b.charge_status], [1, 1, "declined"]);
    assert.equal((await mails(ctx.stripe, declined, /couldn't charge your card/)).length, 1);
    assert.equal(db(ctx.stripe, `SELECT COUNT(*) AS n FROM storage_billing_log WHERE statement_id = '${a.id}' AND action = 'charge.started'`)[0].n, 1);
  });

  test("a new card replaces the old one (detached) and retries a declined statement; removing it falls back to the pay page", async () => {
    if (!ctx.stripe) return;
    await setBilling(ctx.stripe, { state: "on", rate: RATE });
    const o = await billed(ctx.stripe, "sc-replace", { outcomes: ["declined"] });
    const old = cardRow(ctx.stripe, o);
    const first = db(ctx.stripe, `SELECT setup_session_id FROM storage_cards WHERE creator_id = '${o.creator.id}'`)[0];
    assert.equal(statement(ctx.stripe, o).charge_status, "declined");
    const firstEvent = sessionEvent("checkout.session.completed", fake().sessions.get(first.setup_session_id));
    const next = await saveCard(ctx.stripe, o, { brand: "mastercard", last4: "4444" });
    assert.equal(next.outcome, "storage card saved");
    const row = cardRow(ctx.stripe, o);
    assert.deepEqual(await card(o), { brand: "mastercard", last4: "4444" });
    assert.equal(row.customer_id, old.customer_id, "the same Stripe customer");
    assert.equal([...fake().customers.values()].filter((c) => c.metadata.storage_creator_id === o.creator.id).length, 1);
    assert.equal(fake().paymentMethods.get(old.payment_method_id).customer, null, "the old card is detached at Stripe");
    assert.equal(await outcome(firstEvent), "rejected", "a late event for the old page can't bring it back");
    assert.equal(cardRow(ctx.stripe, o).payment_method_id, row.payment_method_id);
    // Back in line: the next sweep charges the new card.
    await sweep(ctx.stripe);
    const s = statement(ctx.stripe, o);
    assert.deepEqual([s.status, s.charge_attempts, chargesOf(s).at(-1).form.payment_method], ["paid", 2, row.payment_method_id]);

    fake().failDetach(true);
    const refused = await o.c.req("DELETE", `${o.api}/card`, { body: {} });
    fake().failDetach(false);
    assert.deepEqual([refused.status, refused.data.error.code], [503, "card_remove_failed"]);
    assert.deepEqual(await card(o), { brand: "mastercard", last4: "4444" }, "nothing changed");
    const removed = await o.c.req("DELETE", `${o.api}/card`, { body: {} });
    assert.equal(removed.status, 200, JSON.stringify(removed.data));
    assert.equal(await card(o), null);
    assert.equal(fake().paymentMethods.get(row.payment_method_id).customer, null);
    assert.equal(cardRow(ctx.stripe, o).payment_method_id, null);
    assert.equal(await outcome({ ...next.event, id: `${next.event.id}_late` }), "rejected", "a late event can't put a removed card back");
    assert.equal(await card(o), null);
    assert.equal((await o.c.req("DELETE", `${o.api}/card`, { body: {} })).data.error.code, "no_card");
    assert.ok(db(ctx.stripe, `SELECT COUNT(*) AS n FROM storage_billing_log WHERE creator_id = '${o.creator.id}' AND action = 'card.removed'`)[0].n === 1);
  });

  test("with no card a statement is paid on the pay page, as before: the owner is emailed the link", async () => {
    if (!ctx.stripe) return;
    await setBilling(ctx.stripe, { state: "on", rate: RATE });
    const o = await billed(ctx.stripe, "sc-nocard", { withCard: false });
    let s = statement(ctx.stripe, o);
    assert.deepEqual([s.status, s.charge_status, s.next_charge_at, s.charge_attempts], ["open", "no_card", null, 0]);
    assert.equal(chargesOf(s).length, 0);
    const issued = await mails(ctx.stripe, o, /storage statement for/);
    assert.equal(issued.length, 1);
    assert.ok(linkIn(issued[0]).includes(`/studio#storage=${o.creator.id}`));
    age(ctx.stripe, s, 3);
    await sweep(ctx.stripe);
    assert.equal(chargesOf(s).length, 0);
    const co = await o.c.post(`${o.api}/statements/${s.id}/checkout`, {});
    assert.equal(co.status, 201, JSON.stringify(co.data));
    assert.equal(await outcome(sessionEvent("checkout.session.completed", fake().pay(co.data.url.split("/pay/")[1]))), "storage statement paid");
    s = statement(ctx.stripe, o);
    assert.equal(s.status, "paid");
  });

  test("only the owner manages the card: members, other creators and a support impersonation can't; the mock charges it", async () => {
    await setBilling(ctx.mock, { state: "on", rate: RATE });
    const o = await billed(ctx.mock, "sc-owner", { withCard: false, run: false });
    const m = await newBuyer(ctx.mock.url, "sc-member");
    await o.c.post(`/api/studio/creators/${o.creator.id}/invites`, { email: m.user.email, role: "admin" });
    const token = new URL(linkIn((await outbox(ctx.mock.url, m.user.email)).find((x) => x.kind === "creator-invite"))).hash.replace("#invite=", "");
    await m.c.post("/api/studio/invites/accept", { token });
    const stranger = await creator(ctx.mock, "sc-stranger");
    for (const who of [m.c, stranger.c]) {
      assert.equal((await who.post(`${o.api}/card`, {})).status, 404);
      assert.equal((await who.post(`${o.api}/card/confirm`, {})).status, 404);
      assert.equal((await who.req("DELETE", `${o.api}/card`, { body: {} })).status, 404);
    }
    assert.equal((await m.c.get(o.api)).data.billing, undefined, "a member sees storage, not billing");
    const admin = await freshAdmin(ctx.mock.url);
    assert.equal((await admin.post(`/api/admin/customers/${o.user.id}/impersonate`, { note: "card check" })).status, 201);
    try {
      for (const r of [await admin.post(`${o.api}/card`, {}), await admin.post(`${o.api}/card/confirm`, {}), await admin.req("DELETE", `${o.api}/card`, { body: {} })]) {
        assert.deepEqual([r.status, r.data.error.code], [403, "impersonation_blocked"], "support can't save, confirm or remove a card");
      }
    } finally {
      await admin.post("/api/impersonation/exit", {});
    }
    assert.equal(db(ctx.mock, `SELECT COUNT(*) AS n FROM storage_cards WHERE creator_id = '${o.creator.id}'`)[0].n, 0);

    const saved = await saveCard(ctx.mock, o);
    assert.equal(saved.confirm.data.saved, true, JSON.stringify(saved.confirm.data));
    assert.deepEqual(await card(o), { brand: "visa", last4: "4242" });
    await sweep(ctx.mock);
    const s = statement(ctx.mock, o);
    assert.deepEqual([s.status, s.charge_status, s.charge_attempts, s.provider_payment_id], ["paid", "succeeded", 1, `mock_pi_charge_${s.id}_1`]);
    const shown = (await o.c.get(o.api)).data.statements.find((x) => x.id === s.id);
    assert.deepEqual([shown.chargeStatus, shown.chargeAttempts, shown.nextChargeAt], ["succeeded", 1, null]);
  });
});

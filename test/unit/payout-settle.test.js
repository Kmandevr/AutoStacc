// Admin payout settling (server/admin/payouts.js payAndSettle): a refused Stripe transfer answers 503 (Cloudflare hides a
// Function's 502), leaves the request open and is audited without secrets; a transfer that loses the settle to a concurrent
// decision is audited with its transfer id and answered 409, never a silent 404.
import { test } from "node:test";
import assert from "node:assert/strict";
import { payAndSettle, transferReason } from "../../server/admin/payouts.js";

// A stand-in D1: the settle UPDATE changes `settled` rows, getPayout returns `current`, audit INSERTs are recorded.
function fakeApp({ settled = 1, current = null } = {}) {
  const audits = [], updates = [];
  const db = {
    prepare: (q) => ({
      bind: (...a) => ({
        run: async () => {
          if (q.includes("INSERT INTO admin_audit")) audits.push({ action: a[2], targetId: a[8], detail: JSON.parse(a[9]) });
          if (q.startsWith("UPDATE payout_requests")) { updates.push(a); return { meta: { changes: settled } }; }
          return { meta: { changes: 1 } };
        },
        first: async () => current
      })
    })
  };
  return { app: { db, _actor: { userId: "u_admin", label: "admin" } }, audits, updates };
}
const payout = { id: "po_1", stripe_account_id: "acct_1", amount_cents: 1600, currency: "USD" };
const refused = () => { throw Object.assign(new Error("Insufficient funds (sk_live_abc123 owner@example.com)"), { type: "StripeInvalidRequestError", code: "balance_insufficient" }); };

test("a refused transfer answers 503, settles nothing and is audited as payout.failed without secrets", async () => {
  const { app, audits, updates } = fakeApp();
  await assert.rejects(payAndSettle(app, payout, { status: "paid", adminId: "u_admin", note: "" }, refused),
    (e) => e.status === 503 && e.code === "transfer_failed" && /still open/.test(e.message) && !/sk_live|@/.test(e.message));
  assert.equal(updates.length, 0, "the request stays requested");
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "payout.failed");
  assert.equal(audits[0].targetId, "po_1");
  assert.equal(audits[0].detail.code, "balance_insufficient");
  assert.doesNotMatch(JSON.stringify(audits[0].detail), /sk_live|example\.com/);
});

test("a transfer that went out but lost the settle is audited as orphaned and answered 409 with its id", async () => {
  const { app, audits } = fakeApp({ settled: 0, current: { status: "declined", transfer_id: null } });
  await assert.rejects(payAndSettle(app, payout, { status: "paid", adminId: "u_admin", note: "" }, async () => ({ id: "tr_9" })),
    (e) => e.status === 409 && e.code === "transfer_orphaned" && e.extra.transferId === "tr_9" && /tr_9/.test(e.message));
  assert.deepEqual(audits.map((a) => [a.action, a.detail.transfer]), [["payout.transfer_orphaned", "tr_9"]]);
});

test("a double click on Send (same transfer already recorded) is the usual 404, not an orphan", async () => {
  const { app, audits } = fakeApp({ settled: 0, current: { status: "paid", transfer_id: "tr_9" } });
  await assert.rejects(payAndSettle(app, payout, { status: "paid", adminId: "u_admin", note: "" }, async () => ({ id: "tr_9" })), (e) => e.status === 404);
  assert.equal(audits.length, 0);
});

test("declining sends nothing; a sent transfer's id is returned to be recorded", async () => {
  let sent = 0;
  const send = async () => (sent++, { id: "tr_1" });
  assert.equal(await payAndSettle(fakeApp().app, payout, { status: "declined", adminId: "u", note: "" }, send), null);
  assert.equal(sent, 0);
  assert.equal(await payAndSettle(fakeApp().app, payout, { status: "paid", adminId: "u", note: "" }, send), "tr_1");
});

test("transferReason keeps Stripe's words but drops keys and emails", () => {
  assert.equal(transferReason(new Error("Bad key rk_test_x9 for a@b.co")), "Bad key [key] for [email]");
  assert.equal(transferReason(undefined), "");
});

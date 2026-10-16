// Paid creator storage, paying a statement: what earnings didn't cover is paid on a hosted Checkout page on AutoStacc's
// main Stripe account (storage is AutoStacc's own service, not a creator's sale), confirmed only by a verified payment
// event (server/payments/events.js hands statement events here, after its once-per-event check). A payment must match
// its statement (by the session, or by the statement id the session carries when an earlier attempt was paid after a
// new one opened), the account, live/test mode, amount and currency; moves are compare-and-set, so a repeated or late
// event changes nothing twice. A chargeback makes the statement unpaid again (the paid limit pauses) until it's won.
// AutoStacc can waive an open statement (a credit) or refund a paid one (the card part through Stripe, the earnings part
// back to earnings); both are logged for the creator and audited.
import { first, run, now, randomToken } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { providerForAccount } from "../payments/index.js";
import { preTaxRefund } from "../payments/refund-amount.js";
import { paidStorageStmt } from "../creators/creators.js";
import { deduct } from "../revenue/deductions.js";
import { logStmt, restoreIfSettled } from "./plans.js";
import { mailOwner } from "./statements.js";

const ACCOUNT = "main";

export const statementBySession = (db, provider, sessionId) =>
  first(db, "SELECT * FROM storage_statements WHERE provider = ? AND provider_session_id = ?", provider, sessionId);
export const statementByPayment = (db, provider, paymentId) =>
  first(db, "SELECT * FROM storage_statements WHERE provider = ? AND provider_payment_id = ?", provider, paymentId);
const statementById = (db, provider, id) => first(db, "SELECT * FROM storage_statements WHERE id = ? AND provider = ?", id, provider);

/** A payment page for an open statement. A new attempt replaces the last one, unless the last one was already paid. */
export async function startCheckout(app, creator, statement, user) {
  if (statement.status !== "open") fail(409, "not_payable", "This statement has nothing to pay.");
  const provider = providerForAccount(app, ACCOUNT);
  if (statement.provider_session_id && statement.provider === provider.name) {
    // Paid a moment ago and the confirmation is still on its way: record it instead of opening a second page.
    const last = await provider.retrieveCheckout(app, statement.provider_session_id).catch(() => null);
    if (last && last.type === "paid") {
      await applyStatementEvent(app, { ...last, provider: provider.name, id: `lookup:${last.sessionId}`, statementId: statement.id, account: ACCOUNT });
      fail(409, "already_paid", "This statement was just paid.");
    }
    await provider.expireCheckout(app, statement.provider_session_id).catch(() => {});
  }
  const attempt = statement.checkout_attempts + 1;
  const back = `${app.config.siteUrl}/studio#storage=${encodeURIComponent(creator.id)}`;
  // Each request gets its own key, so two clicks at once make two pages and the one that loses can close only its own.
  const { sessionId, url } = await provider.createStorageCheckout(app, { statement, key: `storage-${statement.id}-${attempt}-${randomToken(6)}`, email: user.email,
    creatorName: creator.name, successUrl: `${back}&paid=1`, cancelUrl: back });
  const res = await run(app.db, `UPDATE storage_statements SET provider = ?, provider_session_id = ?, checkout_attempts = ?, livemode = ?
    WHERE id = ? AND status = 'open' AND checkout_attempts = ?`, provider.name, sessionId, attempt, provider.livemode(app.config) ? 1 : 0, statement.id, statement.checkout_attempts);
  if (!res.meta.changes) {
    await provider.expireCheckout(app, sessionId).catch(() => {});
    fail(409, "checkout_busy", "A payment page for this statement was just opened. Try again in a moment.");
  }
  await logStmt(app.db, creator.id, user.id, "payment.started", { attempt }, statement.id).run();
  return { url };
}

const reject = (detail) => ({ outcome: "rejected", detail });

// The statement an event is about: its current session, else (a payment on an earlier page) the statement id the session
// carries, else (refunds and disputes) its payment.
async function find(db, ev) {
  if (ev.sessionId) {
    const s = await statementBySession(db, ev.provider, ev.sessionId);
    if (s) return s;
    if (ev.statementId && ev.type === "paid") return statementById(db, ev.provider, ev.statementId);
    return null;
  }
  return ev.paymentId ? statementByPayment(db, ev.provider, ev.paymentId) : null;
}

// A paid statement's plan pauses at once when its payment is disputed.
async function pausePlan(db, s, ev) {
  const res = await run(db, "UPDATE storage_plans SET status = 'past_due', updated_at = ?, updated_by = 'system' WHERE creator_id = ? AND status = 'active'", now(), s.creator_id);
  if (res.meta.changes) {
    await db.batch([paidStorageStmt(db, s.creator_id, null, "past_due"), logStmt(db, s.creator_id, "system", "plan.past_due", { event: ev.id, reason: "disputed" }, s.id)]);
  }
}

/** Applies a verified payment event for a statement. */
export async function applyStatementEvent(app, ev) {
  const { db } = app;
  const s = await find(db, ev);
  if (!s) return reject("no matching storage statement");
  if (ev.statementId && ev.statementId !== s.id) return reject("statement id mismatch");
  if (ev.account && ev.account !== ACCOUNT) return reject("payment account mismatch");
  if (Boolean(s.livemode) !== Boolean(ev.livemode)) return reject("live/test mode mismatch");
  const log = (action, detail = {}) => logStmt(db, s.creator_id, "system", action, { event: ev.id, ...detail }, s.id).run();
  switch (ev.type) {
    case "paid": {
      if (ev.amount !== s.amount_cents || String(ev.currency).toUpperCase() !== s.currency) return reject("amount mismatch");
      const moved = await run(db, "UPDATE storage_statements SET status = 'paid', paid_at = ?, provider_payment_id = ?, provider_session_id = COALESCE(?, provider_session_id) WHERE id = ? AND status = 'open'",
        now(), ev.paymentId || null, ev.sessionId || null, s.id);
      if (!moved.meta.changes) {
        if (s.status === "paid" && (!ev.paymentId || s.provider_payment_id === ev.paymentId)) return { outcome: "already paid" };
        // Money taken twice (two pages both paid) or for a statement that was waived: processPaymentEvent alerts the admins.
        return reject(`statement is ${s.status}`);
      }
      await log("payment.succeeded", { amountCents: ev.amount });
      // A refund that arrived before this payment (webhooks come in any order) applies now.
      const parked = ev.paymentId && await first(db, "SELECT id FROM payment_events WHERE provider = ? AND detail = ? AND outcome = 'refund waiting for payment' LIMIT 1", ev.provider, ev.paymentId);
      if (parked) {
        await run(db, "UPDATE storage_statements SET status = 'refunded', refunded_cents = amount_cents WHERE id = ? AND status = 'paid'", s.id);
        await run(db, "UPDATE payment_events SET outcome = 'refund applied' WHERE id = ?", parked.id);
        await log("payment.refunded", { amountCents: s.amount_cents, arrivedFirst: true });
        return { outcome: "storage statement paid, then refunded (arrived first)" };
      }
      await restoreIfSettled(db, s.creator_id, "system");
      await mailOwner(app, s.creator_id, "paid", s);
      return { outcome: "storage statement paid" };
    }
    case "failed":
      await log("payment.failed");
      return { outcome: "storage payment failed" };
    case "expired":
      await run(db, "UPDATE storage_statements SET provider_session_id = NULL WHERE id = ? AND provider_session_id = ?", s.id, ev.sessionId);
      return { outcome: "storage payment page expired" };
    case "refunded":
    case "partial_refund": {
      // In the statement's own pre-tax money, like orders (#129); full only when Stripe says so.
      const amount = preTaxRefund(s.amount_cents, ev);
      const full = ev.type === "refunded";
      const moved = await run(db, `UPDATE storage_statements SET refunded_cents = MAX(refunded_cents, ?), status = CASE WHEN ? THEN 'refunded' ELSE status END
        WHERE id = ? AND status IN ('paid', 'refunded', 'disputed')`, amount, full ? 1 : 0, s.id);
      if (moved.meta.changes) await log(full ? "payment.refunded" : "payment.partly_refunded", { amountCents: amount });
      return { outcome: moved.meta.changes ? "storage statement refunded" : `no change (${s.status})` };
    }
    // A chargeback: the statement counts as unpaid (the paid limit pauses) until the dispute is won.
    case "disputed": {
      const moved = await run(db, "UPDATE storage_statements SET status = 'disputed' WHERE id = ? AND status = 'paid'", s.id);
      await log("payment.disputed");
      if (moved.meta.changes) await pausePlan(db, s, ev);
      return { outcome: "storage payment disputed, paid limit paused" };
    }
    case "dispute_won": {
      const moved = await run(db, "UPDATE storage_statements SET status = 'paid' WHERE id = ? AND status = 'disputed'", s.id);
      await log("payment.dispute_won");
      if (moved.meta.changes) await restoreIfSettled(db, s.creator_id, "system");
      return { outcome: "storage dispute won, paid again" };
    }
    // Lost: it stays disputed (unpaid); what more to do is the owner's call (docs/creators.md).
    case "dispute_lost":
      await log("payment.dispute_lost", { status: ev.disputeStatus || null });
      return { outcome: "storage dispute lost, statement stays unpaid" };
    default:
      return { outcome: "ignored", detail: ev.type };
  }
}

/** AutoStacc cancels what's left to pay (a credit): the statement closes and a past-due plan gets its limit back. */
export async function waive(app, s, adminId, note) {
  const res = await run(app.db, "UPDATE storage_statements SET status = 'waived', note = ? WHERE id = ? AND status IN ('open', 'carried', 'disputed')", note, s.id);
  if (!res.meta.changes) fail(409, "not_waivable", "Only an open, carried or disputed statement can be waived.");
  if (s.provider_session_id && s.provider) await providerForAccount(app, ACCOUNT).expireCheckout(app, s.provider_session_id).catch(() => {});
  await logStmt(app.db, s.creator_id, adminId, "statement.waived", { note }, s.id).run();
  await restoreIfSettled(app.db, s.creator_id, adminId);
}

/**
 * Refunds a paid statement in full: the card part through Stripe (the provider's key makes a repeat the same refund),
 * the part taken from earnings back to earnings. A refusal from Stripe changes nothing.
 */
export async function refund(app, s, adminId, note) {
  if (s.status !== "paid" || (!s.provider_payment_id && !s.earnings_cents)) fail(409, "not_refundable", "Only a paid statement can be refunded.");
  if (s.provider_payment_id) {
    try {
      await providerForAccount(app, ACCOUNT).refund(app, { id: s.id, provider_payment_id: s.provider_payment_id });
    } catch (e) {
      // Stripe's words stay in the server log, out of the answer.
      console.error("storage refund", e && e.message);
      await logStmt(app.db, s.creator_id, adminId, "payment.refund_failed", { note }, s.id).run();
      fail(503, "refund_failed", "Stripe refused the refund, so nothing changed. Check the payment in Stripe.");
    }
  }
  const res = await run(app.db, "UPDATE storage_statements SET status = 'refunded', refunded_cents = amount_cents, note = ? WHERE id = ? AND status = 'paid'", note, s.id);
  if (!res.meta.changes) return;
  if (s.earnings_cents) await deduct(app.db, { creatorId: s.creator_id, amountCents: -s.earnings_cents, livemode: s.livemode, reason: "storage refund", ref: `storage-refund:${s.id}` });
  await logStmt(app.db, s.creator_id, adminId, "payment.refunded", { amountCents: s.amount_cents, earningsCents: s.earnings_cents, note }, s.id).run();
}

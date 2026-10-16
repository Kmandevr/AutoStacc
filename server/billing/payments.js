// Paid creator storage, paying a statement: a hosted Checkout page on AutoStacc's main Stripe account (storage is
// AutoStacc's own service, not a creator's sale), confirmed only by a verified payment event (server/payments/events.js
// hands statement events here, after its once-per-event check). A payment must match its statement's session, account,
// live/test mode, amount and currency; moves are compare-and-set, so a repeated or late event changes nothing twice.
// AutoStacc can waive an open statement (a credit) or refund a paid one; both are logged for the creator and audited.
import { first, run, now } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { providerForAccount } from "../payments/index.js";
import { logStmt, restoreIfSettled } from "./plans.js";
import { mailOwner } from "./statements.js";

const ACCOUNT = "main";

export const statementBySession = (db, provider, sessionId) =>
  first(db, "SELECT * FROM storage_statements WHERE provider = ? AND provider_session_id = ?", provider, sessionId);
export const statementByPayment = (db, provider, paymentId) =>
  first(db, "SELECT * FROM storage_statements WHERE provider = ? AND provider_payment_id = ?", provider, paymentId);

/** A payment page for an open statement. A new attempt replaces the last one (closed at the provider first). */
export async function startCheckout(app, creator, statement, user) {
  if (statement.status !== "open") fail(409, "not_payable", "This statement has nothing to pay.");
  const provider = providerForAccount(app, ACCOUNT);
  if (statement.provider_session_id && statement.provider === provider.name) {
    await provider.expireCheckout(app, statement.provider_session_id).catch(() => {});
  }
  const attempt = statement.checkout_attempts + 1;
  const back = `${app.config.siteUrl}/studio#storage=${encodeURIComponent(creator.id)}`;
  const { sessionId, url } = await provider.createStorageCheckout(app, { statement, attempt, email: user.email, creatorName: creator.name, successUrl: `${back}&paid=1`, cancelUrl: back });
  const res = await run(app.db, `UPDATE storage_statements SET provider = ?, provider_session_id = ?, checkout_attempts = ?, livemode = ?
    WHERE id = ? AND status = 'open' AND checkout_attempts = ?`, provider.name, sessionId, attempt, provider.livemode(app.config) ? 1 : 0, statement.id, statement.checkout_attempts);
  // Two clicks at once: the other one's page stands; this one is closed so only one can be paid.
  if (!res.meta.changes) {
    await provider.expireCheckout(app, sessionId).catch(() => {});
    fail(409, "checkout_busy", "A payment page for this statement was just opened. Try again in a moment.");
  }
  await logStmt(app.db, creator.id, user.id, "payment.started", { attempt }, statement.id).run();
  return { url };
}

const reject = (detail) => ({ outcome: "rejected", detail });

/** Applies a verified payment event for a statement (found by its session, or by payment for refunds and disputes). */
export async function applyStatementEvent(app, ev) {
  const { db } = app;
  const s = ev.sessionId ? await statementBySession(db, ev.provider, ev.sessionId) : ev.paymentId ? await statementByPayment(db, ev.provider, ev.paymentId) : null;
  if (!s) return reject("no matching storage statement");
  if (ev.statementId && ev.statementId !== s.id) return reject("statement id mismatch");
  if (ev.account && ev.account !== ACCOUNT) return reject("payment account mismatch");
  if (Boolean(s.livemode) !== Boolean(ev.livemode)) return reject("live/test mode mismatch");
  const log = (action, detail = {}) => logStmt(db, s.creator_id, "system", action, { event: ev.id, ...detail }, s.id).run();
  switch (ev.type) {
    case "paid": {
      if (ev.amount !== s.amount_cents || String(ev.currency).toUpperCase() !== s.currency) return reject("amount mismatch");
      const moved = await run(db, "UPDATE storage_statements SET status = 'paid', paid_at = ?, provider_payment_id = ? WHERE id = ? AND status = 'open'",
        now(), ev.paymentId || null, s.id);
      if (!moved.meta.changes) {
        if (s.status === "paid" && (!ev.paymentId || s.provider_payment_id === ev.paymentId)) return { outcome: "already paid" };
        // Money taken for a statement that was waived (or paid another way): processPaymentEvent alerts the admins.
        return reject(`statement is ${s.status}`);
      }
      await log("payment.succeeded", { amountCents: ev.amount });
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
      const full = ev.type === "refunded";
      const moved = await run(db, `UPDATE storage_statements SET refunded_cents = MAX(refunded_cents, ?), status = CASE WHEN ? THEN 'refunded' ELSE status END
        WHERE id = ? AND status IN ('paid', 'refunded')`, ev.amount ?? s.amount_cents, full ? 1 : 0, s.id);
      if (moved.meta.changes) await log(full ? "payment.refunded" : "payment.partly_refunded", { amountCents: ev.amount });
      return { outcome: moved.meta.changes ? "storage statement refunded" : `no change (${s.status})` };
    }
    case "disputed":
    case "dispute_won":
    case "dispute_lost":
      await log(`payment.${ev.type}`, { status: ev.disputeStatus || null });
      return { outcome: `storage ${ev.type.replace("_", " ")}, recorded` };
    default:
      return { outcome: "ignored", detail: ev.type };
  }
}

/** AutoStacc cancels what's owed (a credit): the statement closes and a past-due plan gets its limit back. */
export async function waive(app, s, adminId, note) {
  const res = await run(app.db, "UPDATE storage_statements SET status = 'waived', note = ? WHERE id = ? AND status IN ('open', 'carried')", note, s.id);
  if (!res.meta.changes) fail(409, "not_waivable", "Only an open or carried statement can be waived.");
  if (s.provider_session_id && s.provider) await providerForAccount(app, ACCOUNT).expireCheckout(app, s.provider_session_id).catch(() => {});
  await logStmt(app.db, s.creator_id, adminId, "statement.waived", { note }, s.id).run();
  await restoreIfSettled(app.db, s.creator_id, adminId);
}

/** Refunds a paid statement in full to the card it was paid with (the provider's key makes a repeat the same refund). */
export async function refund(app, s, adminId, note) {
  if (s.status !== "paid" || !s.provider_payment_id) fail(409, "not_refundable", "Only a paid statement can be refunded.");
  await providerForAccount(app, ACCOUNT).refund(app, { id: s.id, provider_payment_id: s.provider_payment_id });
  const res = await run(app.db, "UPDATE storage_statements SET status = 'refunded', refunded_cents = amount_cents, note = ? WHERE id = ? AND status = 'paid'", note, s.id);
  if (res.meta.changes) await logStmt(app.db, s.creator_id, adminId, "payment.refunded", { amountCents: s.amount_cents, note }, s.id).run();
}

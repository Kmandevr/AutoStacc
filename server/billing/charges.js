// Paid creator storage, automatic monthly charges (owner, 2026-10-21, #142): what earnings didn't cover is charged
// off-session to the creator space's saved card (cards.js) by the daily sweep, on the days in BILLING.chargeDays after
// the statement was issued. Each try is claimed compare-and-set on the attempt count, so two sweeps never charge the
// same try twice, and Stripe's idempotency key is per statement and attempt. A payment is recorded only as a verified
// payment (applyStatementEvent: the charge's own answer from Stripe, then its webhook, once). A decline, or a bank
// asking the owner to confirm (SCA), emails the owner a link to update the card or pay on the pay page, which stays the
// fallback; with no card the statement is paid there. Past due after the grace period is unchanged (statements.js).
import { all, first, run } from "../lib/db.js";
import { providerForAccount } from "../payments/index.js";
import { applyStatementEvent } from "./payments.js";
import { cardOf, publicCard } from "./cards.js";
import { mailOwner } from "./mail.js";
import { logStmt } from "./plans.js";
import { BILLING, nextChargeAt } from "./policy.js";

const ACCOUNT = "main";
const BATCH = 200;
// A late first try (a card saved days after the statement) waits at least this long before the next one.
const GAP = 20 * 3600000;

const reject = (detail) => ({ outcome: "rejected", detail });

/** Charges every open statement whose next try is due (never one already being charged or charged). */
export async function chargeDue(app, nowMs) {
  const provider = providerForAccount(app, ACCOUNT);
  const t = new Date(nowMs).toISOString();
  const due = await all(app.db, `SELECT * FROM storage_statements WHERE status = 'open' AND next_charge_at IS NOT NULL AND next_charge_at <= ?
    AND amount_cents >= ? AND livemode = ? AND (charge_status IS NULL OR charge_status NOT IN ('processing', 'succeeded')) ORDER BY next_charge_at LIMIT ?`,
  t, BILLING.minChargeCents, provider.livemode(app.config) ? 1 : 0, BATCH);
  const counts = { charged: 0, processing: 0, failed: 0, noCard: 0, skipped: 0 };
  for (const s of due) {
    try {
      counts[await chargeOne(app, provider, s, nowMs)]++;
    } catch (e) {
      // Only Stripe's code is logged, never card data; the same try runs again on the next sweep.
      console.error("storage charge", s.id, e && (e.code || e.type));
    }
  }
  return counts;
}

async function chargeOne(app, provider, s, nowMs) {
  const { db } = app;
  const t = new Date(nowMs).toISOString();
  const row = await cardOf(db, s.creator_id);
  const card = row && row.payment_method_id && row.provider === provider.name && Boolean(row.livemode) === Boolean(s.livemode) ? row : null;
  if (!card) {
    // No card (never saved, removed, or from the other mode): the owner pays on the pay page; saving a card puts it back in line.
    const res = await run(db, `UPDATE storage_statements SET charge_status = 'no_card', next_charge_at = NULL
      WHERE id = ? AND status = 'open' AND charge_attempts = ? AND next_charge_at <= ?`, s.id, s.charge_attempts, t);
    if (!res.meta.changes) return "skipped";
    await mailOwner(app, s.creator_id, "issued", s);
    return "noCard";
  }
  const attempt = s.charge_attempts + 1;
  // The next try on its set day, but not on the very next sweep after a late one.
  let next = nextChargeAt(Date.parse(s.issued_at), attempt);
  if (next && Date.parse(next) < nowMs + GAP) next = new Date(nowMs + GAP).toISOString();
  const claim = await run(db, `UPDATE storage_statements SET charge_attempts = charge_attempts + 1, charge_status = 'processing', charge_error = NULL, provider = ?, next_charge_at = ?
    WHERE id = ? AND status = 'open' AND charge_attempts = ? AND next_charge_at <= ?`, provider.name, next, s.id, s.charge_attempts, t);
  if (!claim.meta.changes) return "skipped";
  const shown = publicCard(card);
  await logStmt(db, s.creator_id, "system", "charge.started", { attempt, ...shown }, s.id).run();
  if (attempt === 1) await mailOwner(app, s.creator_id, "issued", s, { card: { ...shown, chargeOn: t } });
  let r;
  try {
    r = await provider.chargeCard(app, { statement: s, customerId: card.customer_id, paymentMethodId: card.payment_method_id, attempt });
  } catch (e) {
    // No answer about the card (Stripe unreachable): undo the claim, so the next sweep repeats this try with the same key.
    await run(db, `UPDATE storage_statements SET charge_attempts = ?, charge_status = NULL, next_charge_at = ?
      WHERE id = ? AND charge_attempts = ? AND charge_status = 'processing'`, s.charge_attempts, t, s.id, attempt);
    throw e;
  }
  if (r.paymentId) await run(db, "UPDATE storage_statements SET charge_payment_id = ? WHERE id = ? AND charge_attempts = ?", r.paymentId, s.id, attempt);
  if (r.status === "succeeded") {
    // Recorded like the pay page's lookup: the webhook that follows finds it already paid.
    const res = await applyStatementEvent(app, { id: `lookup:${r.paymentId}`, provider: provider.name, account: ACCOUNT, type: "paid", statementId: s.id,
      paymentId: r.paymentId, amount: r.amount ?? s.amount_cents, currency: r.currency || s.currency, livemode: r.livemode, chargeAttempt: attempt });
    if (res.outcome === "rejected") console.error("storage charge not recorded", s.id, res.detail);
    return "charged";
  }
  // Still processing at Stripe: its webhook settles it (paid, or charge_failed).
  if (r.status === "processing") return "processing";
  await recordFailure(app, s, { attempt, requiresAction: r.status === "requires_action", declineCode: r.declineCode, paymentId: r.paymentId });
  return "failed";
}

// A try that didn't pay, recorded once (the charge's own answer or its webhook, whichever comes first), then the owner
// is emailed. A bank asking the owner to confirm stops automatic tries (off-session tries can't pass it): the pay page.
async function recordFailure(app, s, { attempt, requiresAction, declineCode, paymentId, eventId = null }) {
  const { db } = app;
  const res = await run(db, `UPDATE storage_statements SET charge_status = ?, charge_error = ?, charge_payment_id = COALESCE(?, charge_payment_id),
    next_charge_at = CASE WHEN ? THEN NULL ELSE next_charge_at END WHERE id = ? AND status = 'open' AND charge_attempts = ? AND charge_status = 'processing'`,
  requiresAction ? "requires_action" : "declined", declineCode ? String(declineCode).slice(0, 60) : null, paymentId || null, requiresAction ? 1 : 0, s.id, attempt);
  if (!res.meta.changes) return false;
  const after = await first(db, "SELECT * FROM storage_statements WHERE id = ?", s.id);
  await logStmt(db, s.creator_id, "system", requiresAction ? "charge.action_required" : "charge.failed", { attempt, declineCode: after.charge_error, event: eventId }, s.id).run();
  await mailOwner(app, s.creator_id, requiresAction ? "action_required" : "charge_failed", after,
    { attempt, nextTryAt: after.next_charge_at, card: publicCard(await cardOf(db, s.creator_id)) });
  return true;
}

/** Applies a verified charge_failed event (server/payments/events.js): the same as a decline answered at once. */
export async function applyChargeFailure(app, ev) {
  if (ev.account && ev.account !== ACCOUNT) return reject("payment account mismatch");
  if (!ev.statementId) return reject("no storage statement on the charge");
  const s = await first(app.db, "SELECT * FROM storage_statements WHERE id = ? AND provider = ?", ev.statementId, ev.provider);
  if (!s) return reject("no matching storage statement");
  if (Boolean(s.livemode) !== Boolean(ev.livemode)) return reject("live/test mode mismatch");
  // An older try, or a statement settled since: nothing to change.
  if (s.status !== "open" || Number(ev.chargeAttempt) !== s.charge_attempts) return { outcome: "no change", detail: `statement ${s.status}, try ${s.charge_attempts}` };
  if (ev.paymentId && s.charge_payment_id && s.charge_payment_id !== ev.paymentId) return reject("payment mismatch");
  const done = await recordFailure(app, s, { attempt: s.charge_attempts, requiresAction: Boolean(ev.requiresAction), declineCode: ev.declineCode, paymentId: ev.paymentId, eventId: ev.id });
  if (!done) return { outcome: "storage charge failure already recorded" };
  return { outcome: ev.requiresAction ? "storage charge needs the owner" : "storage charge declined" };
}

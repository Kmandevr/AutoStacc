// Paid creator storage, the daily steps (part of the daily sweep, server/maintenance/sweep.js) and the statements
// (D1 storage_usage_days, storage_statements). Each step is safe to repeat: a day is measured once (its primary key),
// a month's statement is issued once (unique per creator and month), and plan moves are compare-and-set.
//   1. measure: what each creator with a plan stores today, split by part, with the allowance and rate that apply;
//      a cancelled plan back under the allowance ends here (nothing more is charged);
//   2. issue: last month's statement for every creator measured in it, settled first from their earnings ready to pay
//      out (owner, 2026-10-16: never money still on hold), the rest left for the card;
//   3. charge: the rest is charged to the saved card on set days, retried after a decline (charges.js; #142);
//   4. past due: an open statement past its grace period withdraws the paid limit (uploads stop; nothing is deleted).
import { all, first, run, stmt, newId, now } from "../lib/db.js";
import { storageByPart } from "../creators/storage.js";
import { includedQuotaOf } from "../creators/policy.js";
import { paidStorageStmt } from "../creators/creators.js";
import { BILLING, billableBytes, dayOf, periodOf, previousPeriod, daysInPeriod, usageCents, statementOf } from "./policy.js";
import { billingSettings, plansToMeasure, logStmt, OVERDUE } from "./plans.js";
import { earningsOf } from "../revenue/earnings.js";
import { paymentProvider } from "../payments/index.js";
import { chargeDue } from "./charges.js";
import { mailOwner } from "./mail.js";

export { mailOwner };

const BATCH = 200;

export async function measure(app, nowMs) {
  const { db } = app;
  const settings = await billingSettings(db);
  const day = dayOf(nowMs);
  let measured = 0, ended = 0;
  for (const plan of await plansToMeasure(db, day, BATCH)) {
    const parts = await storageByPart(db, plan.creator_id);
    const usedBytes = Object.values(parts).reduce((a, b) => a + Number(b), 0);
    const includedBytes = includedQuotaOf(plan);
    const charged = settings.on;
    const res = await run(db, `INSERT INTO storage_usage_days (creator_id, day, used_bytes, included_bytes, billable_bytes, rate, by_part, measured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(creator_id, day) DO NOTHING`,
    plan.creator_id, day, usedBytes, includedBytes, billableBytes({ usedBytes, includedBytes, charged }), charged ? settings.rate : null, JSON.stringify(parts), now());
    measured += res.meta.changes;
    if (plan.status === "cancelled" && usedBytes <= includedBytes) {
      const done = await run(db, "UPDATE storage_plans SET status = 'ended', ended_at = ?, updated_at = ?, updated_by = 'system' WHERE creator_id = ? AND status = 'cancelled'", now(), now(), plan.creator_id);
      if (done.meta.changes) { ended++; await logStmt(db, plan.creator_id, "system", "plan.ended", { usedBytes, includedBytes }).run(); }
    }
  }
  return { measured, ended };
}

/**
 * Issues last month's statements (each once); never to a first-party creator, who is never charged for storage (#177).
 * An open one is due for its first charge at once: the charge step emails the owner (with the card, or the pay link).
 */
export async function issue(app, nowMs) {
  const { db } = app;
  const period = previousPeriod(periodOf(nowMs));
  const due = await all(db, `SELECT creator_id FROM storage_usage_days d WHERE day LIKE ? || '-%'
    AND NOT EXISTS (SELECT 1 FROM storage_statements s WHERE s.creator_id = d.creator_id AND s.period = ?)
    AND NOT EXISTS (SELECT 1 FROM creators c WHERE c.id = d.creator_id AND c.source = 'catalog') GROUP BY creator_id LIMIT ?`, period, period, BATCH);
  let issued = 0;
  const livemode = paymentProvider(app).livemode(app.config);
  for (const { creator_id: creatorId } of due) {
    const days = await all(db, "SELECT billable_bytes, rate FROM storage_usage_days WHERE creator_id = ? AND day LIKE ? || '-%'", creatorId, period);
    const prior = await first(db, "SELECT id, amount_cents FROM storage_statements WHERE creator_id = ? AND period = ? AND status = 'carried'", creatorId, previousPeriod(period));
    const usage = usageCents(days, period);
    const carriedIn = prior ? prior.amount_cents : 0;
    const available = usage + carriedIn > 0 ? (await earningsOf(db, { id: creatorId }, { livemode, nowMs })).availableCents : 0;
    const { total, earnings, amount, status } = statementOf({ usage, carriedIn, availableEarnings: available });
    const issuedAt = new Date(nowMs).toISOString();
    const dueAt = new Date(nowMs + BILLING.graceDays * 86400000).toISOString();
    const id = newId("ss");
    const [ins] = await db.batch([
      stmt(db, `INSERT INTO storage_statements (id, creator_id, period, days_in_period, days_measured, billable_byte_days, usage_cents, carried_in_cents, earnings_cents,
          amount_cents, currency, status, issued_at, due_at, paid_at, livemode, note, next_charge_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(creator_id, period) DO NOTHING`,
      id, creatorId, period, daysInPeriod(period), days.length, days.reduce((a, d) => a + d.billable_bytes, 0), usage, carriedIn, earnings, amount, BILLING.currency, status,
      issuedAt, dueAt, status === "paid" ? issuedAt : null, livemode ? 1 : 0, status === "paid" ? "Paid from your earnings." : null, status === "open" ? issuedAt : null),
      // Taken from earnings only with the statement that records it (a statement already there means this is a repeat).
      stmt(db, `INSERT INTO earnings_deductions (id, creator_id, amount_cents, livemode, reason, ref, created_at)
        SELECT ?, ?, ?, ?, 'storage', ?, ? WHERE ? > 0 AND EXISTS (SELECT 1 FROM storage_statements WHERE id = ?) ON CONFLICT(ref) DO NOTHING`,
      newId("ded"), creatorId, earnings, livemode ? 1 : 0, `storage:${id}`, issuedAt, earnings, id)
    ]);
    if (!ins.meta.changes) continue;
    issued++;
    await db.batch([
      logStmt(db, creatorId, "system", "statement.issued", { period, usageCents: usage, carriedInCents: carriedIn, totalCents: total, earningsCents: earnings, amountCents: amount, status }, id),
      ...(prior ? [stmt(db, "UPDATE storage_statements SET note = ? WHERE id = ?", `Carried into ${period}.`, prior.id)] : [])
    ]);
  }
  return issued;
}

/** Open statements past their grace period put their creators' plans past due. */
export async function markPastDue(app, nowMs) {
  const { db } = app;
  const t = new Date(nowMs).toISOString();
  const late = await all(db, `SELECT s.* FROM storage_statements s JOIN storage_plans p ON p.creator_id = s.creator_id
    WHERE ${OVERDUE} AND p.status = 'active' LIMIT ?`, t, BATCH);
  let n = 0;
  for (const s of late) {
    // Only while it's still overdue: a payment landing between the read above and here wins.
    const res = await run(db, `UPDATE storage_plans SET status = 'past_due', updated_at = ?, updated_by = 'system' WHERE creator_id = ? AND status = 'active'
      AND EXISTS (SELECT 1 FROM storage_statements s WHERE s.creator_id = storage_plans.creator_id AND ${OVERDUE})`, now(), s.creator_id, t);
    if (!res.meta.changes) continue;
    n++;
    await db.batch([paidStorageStmt(db, s.creator_id, null, "past_due"), logStmt(db, s.creator_id, "system", "plan.past_due", { period: s.period, amountCents: s.amount_cents }, s.id)]);
    await mailOwner(app, s.creator_id, "past_due", s);
  }
  return n;
}

export async function runStorageBilling(app, { nowMs = Date.now() } = {}) {
  const m = await measure(app, nowMs);
  const issued = await issue(app, nowMs);
  const charges = await chargeDue(app, nowMs);
  const pastDue = await markPastDue(app, nowMs);
  return { ...m, issued, charges, pastDue };
}

export const statementsOf = (db, creatorId) => all(db, "SELECT * FROM storage_statements WHERE creator_id = ? ORDER BY period DESC LIMIT 36", creatorId);
export const statementOfCreator = (db, creatorId, id) => first(db, "SELECT * FROM storage_statements WHERE id = ? AND creator_id = ?", id, creatorId);
export const daysOf = (db, creatorId, period) => all(db,
  "SELECT day, used_bytes, included_bytes, billable_bytes, rate, by_part FROM storage_usage_days WHERE creator_id = ? AND day LIKE ? || '-%' ORDER BY day", creatorId, period);

/** This month so far: what's measured and what it comes to now (the statement adds any carried amount). */
export async function monthToDate(db, creatorId, nowMs = Date.now()) {
  const period = periodOf(nowMs);
  const days = await daysOf(db, creatorId, period);
  return { period, daysMeasured: days.length, daysInPeriod: daysInPeriod(period), usageCents: usageCents(days, period),
    billableByteDays: days.reduce((a, d) => a + d.billable_bytes, 0) };
}

export const publicStatement = (s) => ({ id: s.id, period: s.period, status: s.status, daysInPeriod: s.days_in_period, daysMeasured: s.days_measured,
  billableByteDays: s.billable_byte_days, usageCents: s.usage_cents, carriedInCents: s.carried_in_cents, earningsCents: s.earnings_cents, amountCents: s.amount_cents, currency: s.currency,
  issuedAt: s.issued_at, dueAt: s.due_at, paidAt: s.paid_at, refundedCents: s.refunded_cents, note: s.note,
  chargeStatus: s.charge_status || null, chargeAttempts: s.charge_attempts || 0, nextChargeAt: s.next_charge_at || null });

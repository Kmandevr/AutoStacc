// Paid creator storage, plans and the billing log (D1 storage_plans, storage_billing_log). A plan is the storage limit
// a creator chose above the free allowance. The limit only decides how much they may upload; what they pay is what they
// actually store (policy.js). Every change goes to the billing log the creator and AutoStacc both read.
// While a plan is active its limit is the creator's upload quota (creators.storage_paid_bytes through paidStorageStmt);
// past due or cancelled, the limit goes and only new uploads stop: nothing stored is ever deleted or hidden for billing.
import { all, first, run, stmt, newId, now } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { paidStorageStmt } from "../creators/creators.js";
import { getSetting } from "../settings/settings.js";
import { BILLING, GB } from "./policy.js";

export const planOf = (db, creatorId) => first(db, "SELECT * FROM storage_plans WHERE creator_id = ?", creatorId);

export const logStmt = (db, creatorId, actor, action, detail = {}, statementId = null) =>
  stmt(db, "INSERT INTO storage_billing_log (id, creator_id, at, actor, action, statement_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
    newId("sbl"), creatorId, now(), actor, action, statementId, JSON.stringify(detail));

export const logOf = (db, creatorId, max = 100) => all(db,
  "SELECT at, actor, action, statement_id, detail FROM storage_billing_log WHERE creator_id = ? ORDER BY at DESC, id DESC LIMIT ?", creatorId, max);

// The owner's billing switches: on only with a rate set (the setting can't hold a price that isn't the owner's).
export async function billingSettings(db) {
  const [state, rate] = await Promise.all([getSetting(db, "storage_billing"), getSetting(db, "storage_rate")]);
  const r = rate === "unset" ? null : Number(rate);
  return { on: state === "on" && r !== null, state, rate: r, currency: BILLING.currency, graceDays: BILLING.graceDays, minChargeCents: BILLING.minChargeCents, maxCapGb: BILLING.maxCapGb };
}

// An unpaid statement past its grace period keeps the plan past due: a new or bigger limit waits until it's paid.
const overdue = (db, creatorId) => first(db, "SELECT id FROM storage_statements WHERE creator_id = ? AND status = 'open' AND due_at < ? LIMIT 1", creatorId, now());

/** Starts paid storage or changes its limit (both ways: a lower limit than what's stored only stops new uploads). */
export async function setPlan(app, creator, userId, capGb, includedBytes) {
  const { db } = app;
  const settings = await billingSettings(db);
  if (!settings.on) fail(409, "storage_billing_off", "Paid storage isn't available yet.");
  if (!Number.isInteger(capGb) || capGb < 1 || capGb > BILLING.maxCapGb) fail(400, "invalid_field", `Pick a whole number of GB from 1 to ${BILLING.maxCapGb}.`, { field: "capGb" });
  const cap = capGb * GB;
  if (cap <= includedBytes) fail(400, "invalid_field", "Pick a limit above your free storage.", { field: "capGb" });
  if (await overdue(db, creator.id)) fail(409, "storage_past_due", "Pay your overdue storage statement first.");
  const plan = await planOf(db, creator.id);
  const t = now();
  const action = !plan || plan.status === "ended" ? "plan.started" : plan.status === "cancelled" ? "plan.resumed" : "plan.changed";
  await db.batch([
    stmt(db, `INSERT INTO storage_plans (creator_id, status, cap_bytes, started_at, updated_at, updated_by) VALUES (?, 'active', ?, ?, ?, ?)
      ON CONFLICT(creator_id) DO UPDATE SET status = 'active', cap_bytes = excluded.cap_bytes, cancelled_at = NULL, ended_at = NULL,
        started_at = CASE WHEN storage_plans.status = 'ended' THEN excluded.started_at ELSE storage_plans.started_at END,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by`, creator.id, cap, t, t, userId),
    paidStorageStmt(db, creator.id, cap, "active"),
    logStmt(db, creator.id, userId, action, { capBytes: cap, previousCapBytes: plan ? plan.cap_bytes : null, rate: settings.rate })
  ]);
  return planOf(db, creator.id);
}

/** Cancels paid storage: the limit goes at once; storage above the allowance is still charged until it's back under. */
export async function cancelPlan(app, creator, userId) {
  const { db } = app;
  const plan = await planOf(db, creator.id);
  if (!plan || !["active", "past_due"].includes(plan.status)) fail(409, "no_plan", "You don't have paid storage.");
  await db.batch([
    stmt(db, "UPDATE storage_plans SET status = 'cancelled', cancelled_at = ?, updated_at = ?, updated_by = ? WHERE creator_id = ? AND status IN ('active', 'past_due')", now(), now(), userId, creator.id),
    paidStorageStmt(db, creator.id, null),
    logStmt(db, creator.id, userId, "plan.cancelled", { capBytes: plan.cap_bytes })
  ]);
  return planOf(db, creator.id);
}

/** Back in good standing (a statement paid or waived): a past-due plan gets its limit back once nothing else is overdue. */
export async function restoreIfSettled(db, creatorId, actor) {
  const plan = await planOf(db, creatorId);
  if (!plan || plan.status !== "past_due" || (await overdue(db, creatorId))) return false;
  const res = await run(db, "UPDATE storage_plans SET status = 'active', updated_at = ?, updated_by = ? WHERE creator_id = ? AND status = 'past_due'", now(), actor, creatorId);
  if (res.meta.changes !== 1) return false;
  await db.batch([paidStorageStmt(db, creatorId, plan.cap_bytes, "active"), logStmt(db, creatorId, actor, "plan.restored", { capBytes: plan.cap_bytes })]);
  return true;
}

/** Plans whose creators still need today's measurement (anything not ended), a bounded batch. */
export const plansToMeasure = (db, day, max) => all(db,
  `SELECT p.*, c.storage_quota_bytes, c.files_quota_bytes FROM storage_plans p JOIN creators c ON c.id = p.creator_id
   WHERE p.status <> 'ended' AND NOT EXISTS (SELECT 1 FROM storage_usage_days d WHERE d.creator_id = p.creator_id AND d.day = ?)
   ORDER BY p.creator_id LIMIT ?`, day, max);

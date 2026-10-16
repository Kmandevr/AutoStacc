// Money taken from a creator's earnings for something other than a payout (D1 earnings_deductions): today only paid
// storage statements settled from earnings (server/billing/), and the same given back (a negative row) when AutoStacc
// waives or refunds one. A ref is unique, so a retry never takes or gives back twice. earnings.js counts the sum like
// money already paid out, so it comes only out of what has cleared the hold.
import { first, run, newId, now } from "../lib/db.js";

export const deductedCents = async (db, creatorId, livemode) =>
  (await first(db, "SELECT COALESCE(SUM(amount_cents), 0) AS n FROM earnings_deductions WHERE creator_id = ? AND livemode = ?", creatorId, livemode ? 1 : 0)).n;

/** Records a deduction (or, negative, a credit) once per ref; true if this call recorded it. */
export async function deduct(db, { creatorId, amountCents, livemode, reason, ref }) {
  const res = await run(db, `INSERT INTO earnings_deductions (id, creator_id, amount_cents, livemode, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ref) DO NOTHING`, newId("ded"), creatorId, amountCents, livemode ? 1 : 0, reason, ref, now());
  return res.meta.changes === 1;
}

// Payout requests: a creator asks to be paid what has cleared the hold (server/revenue/earnings.js). The owner pays by
// hand for now (a bank transfer, PayPal, ...) and marks the request paid or declined in the Control Center. One open
// request per creator, enforced by a unique index, so two clicks can't both succeed. The details the creator writes
// ("PayPal: name@example.com") are visible only to them and the admin.
import { all, first, run, newId, now } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { SELLING } from "../creators/policy.js";
import { earningsOf } from "./earnings.js";

const isUnique = (e) => /UNIQUE/i.test(String((e && (e.message || e.cause && e.cause.message)) || ""));

export async function requestPayout(db, { creator, user, details, livemode, stripeAccountId = null }) {
  const earnings = await earningsOf(db, creator, { livemode });
  if (earnings.requestedCents > 0) fail(409, "payout_open", "You already have a payout request waiting. It will show as paid when AutoStacc has sent it.");
  if (earnings.availableCents < SELLING.minPayoutCents) {
    fail(409, "below_minimum", `You can ask for a payout once $${(SELLING.minPayoutCents / 100).toFixed(2)} has cleared the ${SELLING.holdDays}-day hold.`);
  }
  const id = newId("po");
  try {
    await run(db, `INSERT INTO payout_requests (id, creator_id, amount_cents, currency, status, payout_details, requested_by, requested_at, stripe_account_id) VALUES (?, ?, ?, 'USD', 'requested', ?, ?, ?, ?)`,
      id, creator.id, earnings.availableCents, details, user.id, now(), stripeAccountId);
  } catch (e) {
    if (isUnique(e)) fail(409, "payout_open", "You already have a payout request waiting.");
    throw e;
  }
  return { id, amountCents: earnings.availableCents };
}

export const payoutsOf = (db, creatorId) =>
  all(db, "SELECT id, amount_cents, currency, status, payout_details, requested_at, handled_at, admin_note FROM payout_requests WHERE creator_id = ? ORDER BY requested_at DESC LIMIT 50", creatorId);

export const publicPayout = (r) => ({ id: r.id, amountCents: r.amount_cents, currency: r.currency, status: r.status, details: r.payout_details || "", viaStripe: Boolean(r.stripe_account_id),
  requestedAt: r.requested_at, handledAt: r.handled_at, note: r.admin_note || "" });

// Admin: every request with its creator, oldest open first.
// One request by id (admin).
export const getPayout = (db, id) => first(db, "SELECT * FROM payout_requests WHERE id = ?", id);

export const allPayouts = (db, status) => all(db,
  `SELECT r.*, c.name AS creator_name, c.slug AS creator_slug FROM payout_requests r JOIN creators c ON c.id = r.creator_id
   WHERE (? IS NULL OR r.status = ?) ORDER BY r.status = 'requested' DESC, r.requested_at ASC LIMIT 200`, status, status);

// Only an open request can be settled, once: the status check is in the update itself.
export async function settlePayout(db, { id, status, adminId, note, transferId = null }) {
  const res = await run(db, "UPDATE payout_requests SET status = ?, handled_by = ?, handled_at = ?, admin_note = ?, transfer_id = ? WHERE id = ? AND status = 'requested'", status, adminId, now(), note || null, transferId, id);
  return res.meta.changes === 1;
}

// Admin, payouts: the creators' payout requests with how each wants to be paid, and marking a request paid (after the
// owner has sent the money) or declined. Settling is once only and recorded in the audit log under the admin's name,
// as are refused and orphaned Stripe transfers.
import { json, readJson, fail, id, str, HttpError } from "../lib/http.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { allPayouts, getPayout, settlePayout, publicPayout } from "../revenue/payouts.js";
import { sendPayout } from "../payments/connect.js";
import { sendEmail } from "../email/index.js";
import { first } from "../lib/db.js";

async function list(app) {
  await requireAdmin(app);
  const status = new URL(app.request.url).searchParams.get("status");
  const rows = await allPayouts(app.db, ["requested", "paid", "declined"].includes(status) ? status : null);
  return json({ payouts: rows.map((r) => ({ ...publicPayout(r), creator: { name: r.creator_name, slug: r.creator_slug, id: r.creator_id } })) });
}

// Stripe's own words for a refused transfer, short and with anything key-shaped or email-shaped taken out, for the
// admin's message and the audit log.
export function transferReason(e) {
  const text = e && e.message ? String(e.message) : "";
  return text.replace(/\b(sk|rk|pk|whsec)_[A-Za-z0-9_*]+/g, "[key]").replace(/[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g, "[email]").slice(0, 200);
}

// Sends (for a connected account) and settles one open request. A refused transfer leaves the request open and is
// logged as payout.failed; a transfer that went out but lost the settle to a concurrent decision is logged as
// payout.transfer_orphaned with the transfer id, so the money is never sent silently. 503, not 502: Cloudflare replaces
// a Function's 502 with its own page and the admin would never see why. `send` is replaceable for unit tests.
export async function payAndSettle(app, payout, { status, adminId, note }, send = sendPayout) {
  let transferId = null;
  if (status === "paid" && payout.stripe_account_id) {
    try {
      transferId = (await send(app, payout)).id;
    } catch (e) {
      if (e instanceof HttpError) throw e; // our own refusal (payouts closed), already worded
      const reason = transferReason(e);
      console.error("payout transfer failed", e && e.type, e && e.code, reason);
      await audit(app, "payout.failed", { targetType: "payout", targetId: payout.id, detail: { reason, code: (e && e.code) || null, type: (e && e.type) || null } });
      fail(503, "transfer_failed", `Stripe couldn't send it${reason ? `: ${reason}` : "."} Nothing was marked paid; the request is still open.`);
    }
  }
  if (await settlePayout(app.db, { id: payout.id, status, adminId, note, transferId })) return transferId;
  if (transferId) {
    // A double click on Send: the same idempotent transfer, already recorded by the first click.
    const current = await getPayout(app.db, payout.id);
    if (current && current.status === "paid" && current.transfer_id === transferId) fail(404, "not_found", "No open payout request with that id.");
    await audit(app, "payout.transfer_orphaned", { targetType: "payout", targetId: payout.id, detail: { transfer: transferId, now: (current && current.status) || null } });
    fail(409, "transfer_orphaned", `The money was sent (Stripe transfer ${transferId}), but the request was settled another way at the same moment, so it isn't marked paid. Check the transfer in Stripe before doing anything else.`, { transferId });
  }
  fail(404, "not_found", "No open payout request with that id.");
}

async function settle(app, { payoutId }) {
  const admin = await requireAdmin(app);
  const body = await readJson(app.request, 2048);
  const status = str(body.status, "status", { pattern: /^(paid|declined)$/ });
  const note = typeof body.note === "string" ? body.note.slice(0, 300) : "";
  const pid = id(payoutId, "payoutId");
  const payout = await getPayout(app.db, pid);
  if (!payout || payout.status !== "requested") fail(404, "not_found", "No open payout request with that id.");
  // A request tied to a connected Stripe account is paid by sending the money (the request id is the transfer's idempotency
  // key, so a retry after a failure half-way is the same transfer); a manual one is marked once the owner has paid it.
  const transferId = await payAndSettle(app, payout, { status, adminId: admin.id, note });
  await audit(app, `payout.${status}`, { targetType: "payout", targetId: pid, detail: { note, ...(transferId ? { transfer: transferId } : {}) } });
  // The creator who asked hears the outcome (if their account still exists).
  const requester = await first(app.db, 'SELECT email FROM "user" WHERE id = ?', payout.requested_by);
  if (requester) await sendEmail(app, "payout-settled", requester.email, { status, amountCents: payout.amount_cents, currency: payout.currency, note, studioUrl: `${app.config.siteUrl}/studio` },
    { dedupeKey: `payout-settled:${pid}` });
  return json({ ok: true });
}

export const routes = [
  ["GET", "/api/admin/payouts", list],
  ["PATCH", "/api/admin/payouts/:payoutId", settle]
];

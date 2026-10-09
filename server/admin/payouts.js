// Admin, payouts: the creators' payout requests with how each wants to be paid, and marking a request paid (after the
// owner has sent the money) or declined. Settling is once only and recorded in the audit log under the admin's name.
import { json, readJson, fail, id, str } from "../lib/http.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { allPayouts, getPayout, settlePayout, publicPayout } from "../revenue/payouts.js";
import { sendPayout } from "../payments/connect.js";

async function list(app) {
  await requireAdmin(app);
  const status = new URL(app.request.url).searchParams.get("status");
  const rows = await allPayouts(app.db, ["requested", "paid", "declined"].includes(status) ? status : null);
  return json({ payouts: rows.map((r) => ({ ...publicPayout(r), creator: { name: r.creator_name, slug: r.creator_slug, id: r.creator_id } })) });
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
  let transferId = null;
  if (status === "paid" && payout.stripe_account_id) {
    try {
      transferId = (await sendPayout(app, payout)).id;
    } catch (e) {
      console.error("payout transfer failed", e && e.type, e && e.code, e && e.message);
      fail(502, "transfer_failed", `Stripe couldn't send it${e && e.message ? `: ${String(e.message).slice(0, 200)}` : "."} Nothing was marked paid.`);
    }
  }
  if (!(await settlePayout(app.db, { id: pid, status, adminId: admin.id, note, transferId }))) fail(404, "not_found", "No open payout request with that id.");
  await audit(app, `payout.${status}`, { targetType: "payout", targetId: pid, detail: { note, ...(transferId ? { transfer: transferId } : {}) } });
  return json({ ok: true });
}

export const routes = [
  ["GET", "/api/admin/payouts", list],
  ["PATCH", "/api/admin/payouts/:payoutId", settle]
];

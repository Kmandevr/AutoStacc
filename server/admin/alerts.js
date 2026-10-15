// Admin, payment alerts: sorts the payment events the summary flags (refused, errored or parked) into critical, warning
// and info, with one next step each, so a payment that may have been taken without access stands out from a refund
// that is only waiting for its payment. Pure (no database); server/admin/routes.js reads the rows.
const PAID = /^(mock\.paid|checkout\.session\.(completed|async_payment_succeeded))$/;
const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g;

export function paymentAlert(row) {
  const outcome = String(row.outcome || "");
  const parked = /waiting for payment$/.test(outcome);
  const severity = parked ? "info" : PAID.test(String(row.type || "")) ? "critical" : "warning";
  const next = {
    critical: "Money may have been taken without access: open the order, find the payment in Stripe, then grant access or refund it.",
    warning: "A refund, dispute or other payment change didn't apply here: check it in Stripe and change the order or access by hand if needed.",
    info: "Waiting: it applies itself when its payment arrives. Look again only if it is still here after a day."
  }[severity];
  return { id: row.id, type: row.type, orderId: row.order_id || null, outcome, detail: row.detail ? String(row.detail).replace(EMAIL, "[email]").slice(0, 300) : null,
    receivedAt: row.received_at, severity, next };
}

const RANK = { critical: 0, warning: 1, info: 2 };
// Most serious first, newest first within each kind.
export const paymentAlerts = (rows) => rows.map(paymentAlert)
  .sort((a, b) => RANK[a.severity] - RANK[b.severity] || String(b.receivedAt).localeCompare(String(a.receivedAt)));

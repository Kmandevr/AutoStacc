// The Control Center's payment alerts (server/admin/alerts.js): a refused or errored payment is critical, a refund or
// dispute that didn't apply is a warning, a parked one is info; most serious first; no customer email in the detail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentAlert, paymentAlerts } from "../../server/admin/alerts.js";

const row = (type, outcome, at, detail = null) => ({ id: `${type}:${at}`, type, outcome, detail, order_id: "ord_1", received_at: at });

test("severity follows what the event means for the customer's money", () => {
  for (const t of ["mock.paid", "checkout.session.completed", "checkout.session.async_payment_succeeded"]) {
    assert.equal(paymentAlert(row(t, "rejected", "a")).severity, "critical", t);
    assert.equal(paymentAlert(row(t, "error", "a")).severity, "critical", t);
  }
  assert.equal(paymentAlert(row("charge.refunded", "rejected", "a")).severity, "warning");
  assert.equal(paymentAlert(row("charge.refunded", "refund waiting for payment", "a")).severity, "info");
  assert.equal(paymentAlert(row("charge.dispute.created", "dispute waiting for payment", "a")).severity, "info");
  assert.match(paymentAlert(row("mock.paid", "rejected", "a")).next, /without access/);
});

test("critical first, newest first within a kind; emails are scrubbed from details", () => {
  const out = paymentAlerts([row("charge.refunded", "refund waiting for payment", "2026-03"), row("charge.refunded", "rejected", "2026-02"),
    row("mock.paid", "rejected", "2026-01", "for a.b@example.com"), row("mock.paid", "error", "2026-04")]);
  assert.deepEqual(out.map((a) => [a.severity, a.receivedAt]), [["critical", "2026-04"], ["critical", "2026-01"], ["warning", "2026-02"], ["info", "2026-03"]]);
  assert.equal(out[1].detail, "for [email]");
  assert.equal(out[1].orderId, "ord_1");
});

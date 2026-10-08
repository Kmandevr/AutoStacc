// Email templates: which sender each kind uses, and every template renders AutoStacc mail with escaped values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { render, senderOf, templates } from "../../server/email/templates.js";

test("purchase mail comes from the store address, everything else from noreply", () => {
  assert.equal(senderOf("purchase-confirmation"), "store");
  assert.equal(senderOf("purchases-linked"), "store");
  for (const k of ["verify-email", "reset-password", "account-exists", "payment-rejected"]) assert.equal(senderOf(k), "noreply");
  assert.ok(Object.keys(templates).every((k) => ["store", "noreply"].includes(senderOf(k))));
});

test("templates are AutoStacc-branded and escape data", () => {
  const m = render("verify-email", { url: "https://autostacc.com/x?a=<b>" });
  assert.match(m.html, /AutoStacc|Auto<span/);
  assert.doesNotMatch(m.html, /GLITCHES/);
  assert.ok(!m.html.includes("<b>"));
});

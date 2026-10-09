// Every kind of product has a Stripe tax code, and the codes are ones Managed Payments accepts.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { TAX_CODES, taxCodeFor, GENERAL_TAX_CODE } from "../../server/payments/tax-codes.js";

// The eligible digital-goods codes this store uses (docs.stripe.com/payments/managed-payments/eligibility).
const ELIGIBLE = new Set(["txcd_10000000", "txcd_10401100", "txcd_10505001", "txcd_10402100"]);

test("every kind in data/product-types.js has an eligible tax code, and none is left over", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL("../../data/product-types.js", import.meta.url), "utf8"), sandbox);
  const kinds = Object.keys(sandbox.window.PRODUCT_TYPES).sort();
  assert.deepEqual(Object.keys(TAX_CODES).sort(), kinds);
  for (const k of kinds) assert.ok(ELIGIBLE.has(taxCodeFor(k)), k);
});

test("an unknown kind falls back to the general code", () => {
  assert.equal(taxCodeFor("nonsense"), GENERAL_TAX_CODE);
  assert.equal(taxCodeFor(undefined), GENERAL_TAX_CODE);
});

// The payout countries the Studio offers (js/studio-earnings.js) are exactly the ones the server accepts
// (server/payments/connect.js), and are all real two-letter codes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PAYOUT_COUNTRIES } from "../../server/payments/connect.js";

test("the Studio's country list equals the server's", () => {
  const src = fs.readFileSync(new URL("../../js/studio-earnings.js", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("const COUNTRIES = {"), src.indexOf("};", src.indexOf("const COUNTRIES = {")));
  const shown = [...block.matchAll(/\b([A-Z]{2}): "/g)].map((m) => m[1]);
  assert.deepEqual([...shown].sort(), [...PAYOUT_COUNTRIES].sort());
  assert.equal(new Set(PAYOUT_COUNTRIES).size, PAYOUT_COUNTRIES.length, "no duplicates");
  for (const c of PAYOUT_COUNTRIES) assert.match(c, /^[A-Z]{2}$/);
});

// Moderation's pure parts: which state changes a team may make (server/community/core/moderate.js canChange) and how
// the report queue is ranked (features/reports/triage.js): danger first, then hurt or threat wording, then harassment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canChange } from "../../server/community/core/moderate.js";
import { priority } from "../../server/community/features/reports/triage.js";

test("a team hides what's showing, removes what's showing or hidden, and restores only its own kind of removal", () => {
  const v = { state: "visible" }, h = { state: "hidden" };
  assert.equal(canChange(v, "hidden"), true);
  assert.equal(canChange(h, "hidden"), false);
  assert.equal(canChange(v, "removed"), true);
  assert.equal(canChange(h, "removed"), true);
  assert.equal(canChange(h, "visible"), true);
  assert.equal(canChange(v, "visible"), false);
  assert.equal(canChange({ state: "removed", removedReason: "space_rules" }, "visible"), true);
  for (const why of ["legal", "author"]) {
    assert.equal(canChange({ state: "removed", removedReason: why }, "visible"), false, why);
    assert.equal(canChange({ state: "removed", removedReason: why }, "removed"), false, why);
  }
  assert.equal(canChange(v, "deleted"), false);
});

test("danger outranks everything, then hurt and threat wording, then harassment, then how many reported", () => {
  const danger = priority({ reasons: ["danger"], text: "" });
  const hurt = priority({ reasons: ["rules"], text: "I want to end my life" });
  const threat = priority({ reasons: ["rules"], text: "I know where you live" });
  const harassment = priority({ reasons: ["harassment"], text: "rude" });
  const many = priority({ reasons: ["spam", "spam", "spam"], text: "buy now" });
  const one = priority({ reasons: ["spam"], text: "buy now" });
  assert.ok(danger > hurt && hurt > threat && threat > harassment && harassment > many && many > one);
  assert.ok(priority({ reasons: ["rules"], text: "SUICIDÉ" }) > one, "case and accents folded");
});

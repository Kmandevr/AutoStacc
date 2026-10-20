// Moderation's pure parts: which state changes a team may make (server/community/core/moderate.js canChange) and how
// the report queue is ranked (features/reports/triage.js, with core/wording.js): danger first, then hurt or threat
// wording, then harassment; and what the 12 months of keeping removed text allow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canChange } from "../../server/community/core/moderate.js";
import { priority } from "../../server/community/features/reports/triage.js";
import { mentionsHurt, mentionsThreat } from "../../server/community/core/wording.js";

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

test("a removal under a space's rules can be undone only while its text is kept (12 months)", () => {
  const now = Date.parse("2026-10-20T00:00:00Z");
  assert.equal(canChange({ state: "removed", removedReason: "space_rules", removedAt: "2026-06-01T00:00:00Z" }, "visible", now), true);
  assert.equal(canChange({ state: "removed", removedReason: "space_rules", removedAt: "2025-06-01T00:00:00Z" }, "visible", now), false);
});

test("the shared wording lists: hurt and threat, folded, with no false alarms on music talk", () => {
  assert.equal(mentionsHurt("I want to END MY LIFE"), true);
  assert.equal(mentionsHurt("this drop kills"), false);
  assert.equal(mentionsThreat("I know where you live"), true);
  assert.equal(mentionsThreat("find your sound"), false);
});

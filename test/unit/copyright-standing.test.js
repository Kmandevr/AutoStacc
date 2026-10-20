// Copyright levels (server/copyright/standing.js levelOf): whole strikes are 2 units and half strikes 1, the level is
// the whole strikes rounded down up to 3, and a hold is always 3.
import { test } from "node:test";
import assert from "node:assert/strict";
import { levelOf, UNITS } from "../../server/copyright/standing.js";

test("half strikes add up to whole ones; the level stops at 3; a hold is 3", () => {
  assert.equal(levelOf(0), 0);
  assert.equal(levelOf(UNITS.half), 0, "one member's strike is only half for the space");
  assert.equal(levelOf(UNITS.half * 2), 1);
  assert.equal(levelOf(UNITS.whole + UNITS.half), 1);
  assert.equal(levelOf(UNITS.whole * 2), 2);
  assert.equal(levelOf(UNITS.whole * 7), 3);
  assert.equal(levelOf(0, true), 3);
});

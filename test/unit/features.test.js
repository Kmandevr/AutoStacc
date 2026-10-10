// Feature switches (server/lib/features.js): each is on by default, a deployment can switch any off with FEATURES_OFF,
// a switched-off feature answers 404 like a missing route, and the browser's copy (data/features.js) matches.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { FEATURES, isOn, requireFeature } from "../../server/lib/features.js";

const app = (off) => ({ env: off === undefined ? {} : { FEATURES_OFF: off } });

test("on by default; FEATURES_OFF switches named ones off; unknown names are never on", () => {
  for (const name of Object.keys(FEATURES)) assert.equal(isOn(app(), name), true, name);
  assert.equal(isOn(app(" downloads.bundles , packs.suggestions"), "downloads.bundles"), false);
  assert.equal(isOn(app("downloads.bundles"), "packs.builder"), true);
  assert.equal(isOn(app(), "made.up"), false);
});

test("a switched-off feature answers 404", () => {
  assert.throws(() => requireFeature(app("packs.builder"), "packs.builder"), (e) => e.status === 404);
  assert.doesNotThrow(() => requireFeature(app(), "packs.builder"));
});

test("the browser's copy lists the same switches", () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(new URL("../../data/features.js", import.meta.url), "utf8"), { window });
  assert.deepEqual(Object.keys(window.FEATURES).sort(), Object.keys(FEATURES).sort());
});

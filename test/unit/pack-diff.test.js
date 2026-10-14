// Revision matching (js/pack-diff.js): hash first, never name alone; same, moved, replaced, added and removed; copies
// pair up once each; case and Unicode form don't make a file new.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { match } = require("../../js/pack-diff.js");
const h = (c) => c.repeat(64);

const base = [
  { assetId: "as_kick", path: "Drums/Kick.wav", sha256: h("a") },
  { assetId: "as_air", path: "Textures/Air.aif", sha256: h("b") },
  { assetId: "as_readme", path: "Read me.txt", sha256: h("c") },
  { assetId: "as_wobble", path: "Presets/Wobble.vital", sha256: h("d") }
];

test("the diff matrix: same, moved, replaced, added, removed", () => {
  const files = [
    { path: "Drums/Kick.wav", sha256: h("a") },
    { path: "Ambience/Air.aif", sha256: h("b") },
    { path: "Read me.txt", sha256: h("e") },
    { path: "Changelog.txt", sha256: h("f") }
  ];
  const d = match(files, base);
  assert.deepEqual(d.matches.map((m) => m && [m.assetId, m.change]), [["as_kick", "same"], ["as_air", "moved"], ["as_readme", "replaced"], null]);
  assert.deepEqual(d.removed.map((b) => b.assetId), ["as_wobble"]);
  assert.deepEqual(d.counts, { same: 1, moved: 1, replaced: 1, added: 1, removed: 1 });
});

test("hash beats name: a file's bytes moving to another's path is a move, not a replacement", () => {
  // Kick's bytes now live at Air's path, and Air's path's old bytes are gone: Kick moved there; Air is removed.
  const d = match([{ path: "Textures/Air.aif", sha256: h("a") }], base);
  assert.deepEqual(d.matches[0], { assetId: "as_kick", change: "moved", from: "Drums/Kick.wav" });
  assert.ok(d.removed.some((b) => b.assetId === "as_air"));
});

test("copies pair up once each; case and Unicode form don't make a file new", () => {
  const twins = [{ assetId: "as_1", path: "A/x.wav", sha256: h("a") }, { assetId: "as_2", path: "B/x.wav", sha256: h("a") }];
  const d = match([{ path: "b/X.WAV", sha256: h("a") }, { path: "C/x.wav", sha256: h("a") }, { path: "D/x.wav", sha256: h("a") }], twins);
  assert.deepEqual(d.matches.map((m) => m && [m.assetId, m.change]), [["as_2", "same"], ["as_1", "moved"], null]);
  const nfd = match([{ path: "Café.txt", sha256: h("z") }], [{ assetId: "as_c", path: "Café.txt", sha256: h("y") }]);
  assert.equal(nfd.matches[0].change, "replaced");
  assert.deepEqual(match([], base).counts, { same: 0, moved: 0, replaced: 0, added: 0, removed: 4 });
});

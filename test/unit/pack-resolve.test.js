// Pack Builder resolution (js/pack-resolve.js): the creator's own value, then the nearest folder default, then an
// accepted or sure suggestion; moves change only inherited values, never a creator's own; "none" stops inheritance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const R = require("../../js/pack-resolve.js");

const folders = [
  { id: "drums", parentId: null, name: "Drums" },
  { id: "kicks", parentId: "drums", name: "Kicks" },
  { id: "loops", parentId: null, name: "Loops" }
];
const sug = (assetId, field, value, confidence, extra = {}) => ({ assetId, field, value, origin: "filename", confidence, status: "suggested", ...extra });
const mine = (assetId, field, value) => ({ assetId, field, value, origin: "creator", confidence: null, status: "accepted" });

const base = {
  entries: [{ assetId: "a", folderId: "kicks" }, { assetId: "b", folderId: "kicks" }, { assetId: "c", folderId: "loops" }, { assetId: "d", folderId: null }],
  folders,
  values: [
    sug("a", "instrument", "kick", 0.94), sug("a", "bpm", "128", 0.6),
    sug("b", "instrument", "kick", 0.9), mine("b", "instrument", "808"),
    sug("c", "kind", "loops", 0.7), sug("c", "kind", "one-shots", 0.5, { status: "accepted" }),
    sug("d", "key", "a-minor", 0.95, { status: "rejected" })
  ],
  folderValues: [{ folderId: "drums", field: "kind", value: "one-shots" }, { folderId: "kicks", field: "instrument", value: "kick" }]
};

test("order: creator, nearest folder, accepted suggestion, sure suggestion; rejected and unsure ones never count", () => {
  const r = R.resolveVersion(base);
  assert.deepEqual(r.get("b").instrument, { value: "808", source: "creator" }, "the creator's own value wins over the folder");
  assert.equal(r.get("a").instrument.source, "folder", "the nearest folder's default comes before a suggestion");
  assert.deepEqual([r.get("a").kind.value, r.get("a").kind.folder], ["one-shots", "Drums"], "inherited from a folder further up");
  assert.equal(r.get("a").bpm, undefined, "an unsure suggestion is only a suggestion");
  assert.deepEqual([r.get("c").kind.value, r.get("c").kind.source], ["one-shots", "accepted"], "accepted beats a stronger unaccepted one");
  assert.equal(r.get("d").key, undefined, "a rejected suggestion never comes back");
});

test("an empty creator value means none and stops inheritance", () => {
  const r = R.resolveVersion({ ...base, values: [...base.values, mine("a", "kind", "")] });
  assert.equal(r.get("a").kind, undefined);
  assert.equal(r.get("b").kind.value, "one-shots", "only that file");
});

test("a move preview lists what an inherited value would become; creator values never move", () => {
  const changes = R.moveChanges(base, ["a", "b"], "loops");
  // Leaving Drums loses its kind default; a's instrument stays "kick" (the engine is sure of it), so it isn't listed.
  assert.deepEqual(changes, [
    { assetId: "a", field: "kind", from: "one-shots", to: null },
    { assetId: "b", field: "kind", from: "one-shots", to: null }
  ]);
  assert.ok(!changes.some((c) => c.assetId === "b" && c.field === "instrument"), "the creator's 808 stays");
});

test("folder loops and unknown folders can't hang or break it", () => {
  const loop = [{ id: "x", parentId: "y", name: "X" }, { id: "y", parentId: "x", name: "Y" }];
  const r = R.resolveVersion({ entries: [{ assetId: "a", folderId: "x" }, { assetId: "b", folderId: "gone" }], folders: loop, values: [], folderValues: [{ folderId: "y", field: "kind", value: "loops" }] });
  assert.equal(r.get("a").kind.value, "loops");
  assert.deepEqual(r.get("b"), {});
});

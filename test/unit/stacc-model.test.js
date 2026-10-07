// Your Stacc's model (js/stacc-model.js): owned files become one list of assets that keep their project, Stacclet,
// Pac and product; every library view and filter is built from that list without copying an asset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const stacc = require("../../js/stacc-model.js");

const catalog = {
  projects: [{ id: "gs", name: "Glitches & Stitches" }, { id: "two", name: "Second Project" }],
  stacclets: [{ id: "frayed", project: "gs", title: "Frayed Signals" }, { id: "kit", project: "two", title: "Kit" }],
  pacs: [{ id: "fs-midi", stacclet: "frayed", title: "MIDI Pac" }, { id: "fs-samples", stacclet: "frayed", title: "Samples Pac" }, { id: "kit-presets", stacclet: "kit", title: "Presets Pac" }],
  contentTypes: { midi: { label: "MIDI", formats: ["mid"] }, samples: { label: "Samples", formats: ["wav"] }, loops: { label: "Loops", formats: [] }, presets: { label: "Presets", formats: ["fxp"] }, other: { label: "Other", formats: [] } }
};
const file = (id, filename, extra = {}) => ({ id, filename, label: "", sizeBytes: 10, pacId: null, kind: "", ...extra });
const items = [
  { productId: "fs-pack", title: "Frayed Signals Pack", projectId: "gs", pacs: ["fs-midi", "fs-samples"], sources: ["purchase"], files: [
    file("pf_bass1", "Bass 01.mid", { pacId: "fs-midi" }),
    file("pf_bass2", "Bass 02.MID", { pacId: "fs-midi" }),
    file("pf_kick", "Kick 01.wav", { pacId: "fs-samples" }),
    file("pf_loop", "Loop 01.wav", { pacId: "fs-samples", kind: "loops" }),
    file("pf_readme", "readme.pdf")
  ] },
  { productId: "kit", title: "Kit", projectId: "two", pacs: ["kit-presets"], sources: ["free"], files: [
    file("pf_pad", "Pad 01.fxp", { pacId: "kit-presets" }),
    file("pf_chords", "Chords 01.mid", { pacId: "kit-presets" }),
    // A Pac the product doesn't deliver is ignored: the file stays under its product.
    file("pf_stray", "Stray.mid", { pacId: "fs-midi" })
  ] }
];

const assets = stacc.assetsFrom(items, catalog);
const ids = (list) => list.map((a) => a.id);

test("each owned file becomes one asset that keeps every relationship", () => {
  assert.equal(assets.length, 8);
  assert.equal(new Set(ids(assets)).size, 8);
  assert.deepEqual(assets.find((a) => a.id === "pf_bass2"), {
    id: "pf_bass2", name: "Bass 02.MID", filename: "Bass 02.MID", format: "mid", kind: "midi", sizeBytes: 10,
    productId: "fs-pack", productTitle: "Frayed Signals Pack", projectId: "gs", staccletId: "frayed", pacId: "fs-midi", sources: ["purchase"]
  });
  const stray = assets.find((a) => a.id === "pf_stray");
  assert.deepEqual([stray.projectId, stray.staccletId, stray.pacId], ["two", null, null]);
});

test("kinds: the admin's choice wins, then the extension, then other", () => {
  assert.equal(assets.find((a) => a.id === "pf_loop").kind, "loops");
  assert.equal(assets.find((a) => a.id === "pf_kick").kind, "samples");
  assert.equal(assets.find((a) => a.id === "pf_readme").kind, "other");
  assert.equal(stacc.kindOf({ filename: "x.wav", kind: "made-up" }, catalog.contentTypes), "samples");
});

test("the project view nests Project → Stacclet → Pac → content type", () => {
  const tree = stacc.tree(assets, catalog);
  assert.deepEqual(tree.map((p) => [p.name, p.count]), [["Glitches & Stitches", 5], ["Second Project", 3]]);
  const frayed = tree[0].stacclets[0];
  assert.equal(frayed.title, "Frayed Signals");
  assert.deepEqual(frayed.pacs.map((p) => [p.title, p.kinds.map((k) => [k.label, ids(k.assets)])]), [
    ["MIDI Pac", [["MIDI", ["pf_bass1", "pf_bass2"]]]],
    ["Samples Pac", [["Samples", ["pf_kick"]], ["Loops", ["pf_loop"]]]]
  ]);
  assert.deepEqual(tree[0].products.map((x) => [x.title, ids(x.kinds[0].assets)]), [["Frayed Signals Pack", ["pf_readme"]]]);
});

test("the content-type view spans every project", () => {
  const groups = stacc.byKind(assets, catalog);
  assert.deepEqual(groups.map((g) => [g.label, g.assets.length]), [["MIDI", 4], ["Samples", 1], ["Loops", 1], ["Presets", 1], ["Other", 1]]);
});

test("both views hold the very same asset objects (no duplication)", () => {
  const fromTree = stacc.tree(assets, catalog)[0].stacclets[0].pacs[0].kinds[0].assets[0];
  const fromKinds = stacc.byKind(assets, catalog)[0].assets[0];
  const fromFilter = stacc.filter(assets, { project: "gs", stacclet: "frayed", kind: "midi" })[0];
  assert.equal(fromTree.id, "pf_bass1");
  assert.equal(fromTree, fromKinds);
  assert.equal(fromTree, fromFilter);
  assert.equal(fromTree, assets[0]);
});

test("filters narrow by project, Stacclet, Pac, content type and format, together", () => {
  assert.deepEqual(ids(stacc.filter(assets, { kind: "midi" })), ["pf_bass1", "pf_bass2", "pf_chords", "pf_stray"]);
  assert.deepEqual(ids(stacc.filter(assets, { project: "gs", stacclet: "frayed", kind: "midi" })), ["pf_bass1", "pf_bass2"]);
  assert.deepEqual(ids(stacc.filter(assets, { pac: "fs-samples" })), ["pf_kick", "pf_loop"]);
  assert.deepEqual(ids(stacc.filter(assets, { format: "wav", kind: "loops" })), ["pf_loop"]);
  assert.deepEqual(stacc.tree(assets, catalog, { kind: "presets" }).map((p) => p.id), ["two"]);
  assert.deepEqual(stacc.facets(assets).kinds, [["loops", 1], ["midi", 4], ["other", 1], ["presets", 1], ["samples", 1]]);
});

test("nothing owned means empty views", () => {
  assert.deepEqual(stacc.assetsFrom([], catalog), []);
  assert.deepEqual(stacc.tree([], catalog), []);
  assert.deepEqual(stacc.byKind([], catalog), []);
});

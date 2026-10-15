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
    id: "pf_bass2", key: "pf_bass2", tags: [], collections: [], name: "Bass 02.MID", filename: "Bass 02.MID", format: "mid", kind: "midi", sizeBytes: 10, folder: "", bundleable: false, availableUntil: null,
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

test("kinds: an old kind name stored on a file still files it under its new kind", () => {
  const types = { "one-shots": { label: "One-shots", formats: ["wav"] }, loops: { label: "Loops", formats: [] }, other: { label: "Other", formats: [] } };
  const aliases = { samples: "one-shots", loop: "loops" };
  assert.equal(stacc.kindOf({ filename: "Kick.wav", kind: "samples" }, types, aliases), "one-shots");
  assert.equal(stacc.kindOf({ filename: "Groove.wav", kind: "loop" }, types, aliases), "loops");
  assert.equal(stacc.kindOf({ filename: "notes.txt", kind: "samples" }, types, {}), "other");
  const [asset] = stacc.assetsFrom([{ productId: "p", title: "P", files: [{ id: "pf_1", filename: "a.wav", kind: "samples" }] }], { contentTypes: types, kindAliases: aliases });
  assert.equal(asset.kind, "one-shots");
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

test("the worker's requests (answer) build once, then give each view with its menus, the same as calling the model", () => {
  const memo = {};
  const built = stacc.answer(memo, { type: "build", items, catalog });
  assert.deepEqual(built.assets, stacc.assetsFrom(items, catalog));
  const kinds = stacc.answer(memo, { type: "view", view: "kinds", filter: { project: "gs" } });
  assert.equal(kinds.view, "kinds");
  assert.deepEqual(kinds.groups, stacc.byKind(assets, catalog, { project: "gs" }));
  assert.deepEqual(kinds.facets, stacc.facets(assets));
  const projects = stacc.answer(memo, { type: "view", view: "projects", filter: {} });
  assert.deepEqual(projects.groups, stacc.tree(assets, catalog, {}));
  assert.deepEqual(stacc.answer({}, { type: "view", view: "projects" }).groups, []);
  assert.throws(() => stacc.answer(memo, { type: "nope" }), /Unknown Stacc request/);
});

test("search: every word must appear in a file's name, file name or product title, alongside the other filters", () => {
  assert.deepEqual(ids(stacc.filter(assets, { q: "bass" })), ["pf_bass1", "pf_bass2"]);
  assert.deepEqual(ids(stacc.filter(assets, { q: "FRAYED kick" })), ["pf_kick"], "product title and file name, any case");
  assert.deepEqual(ids(stacc.filter(assets, { q: "01", project: "two" })), ["pf_pad", "pf_chords"]);
  assert.deepEqual(stacc.filter(assets, { q: "nothing-like-this" }), []);
  const view = stacc.answer({ assets, catalog }, { type: "view", view: "kinds", filter: { q: "bass" } });
  assert.equal(view.count, 2);
  assert.equal(view.total, 8);
});

test("a Pac published from Pack Builder shows its own folders; others keep content types", () => {
  const withFolders = [{ productId: "fs-pack", title: "Frayed Signals Pack", projectId: "gs", pacs: ["fs-samples", "fs-midi"], files: [
    file("pf_k1", "Kick 01.wav", { pacId: "fs-samples", folderPath: "Drums/Kicks" }),
    file("pf_k2", "Kick 02.wav", { pacId: "fs-samples", folderPath: "Drums/Kicks" }),
    file("pf_r", "Read me.txt", { pacId: "fs-samples", folderPath: "" }),
    file("pf_m", "Bass.mid", { pacId: "fs-midi" })
  ] }];
  const list = stacc.assetsFrom(withFolders, catalog);
  const pacs = stacc.tree(list, catalog)[0].stacclets[0].pacs;
  const samples = pacs.find((p) => p.id === "fs-samples");
  assert.deepEqual(ids(samples.folders.assets), ["pf_r"], "top-level files sit at the root");
  assert.equal(samples.folders.count, 3);
  const [drums] = samples.folders.folders;
  assert.deepEqual([drums.name, drums.path, drums.count, ids(drums.assets)], ["Drums", "Drums", 2, []]);
  assert.deepEqual(drums.folders.map((f) => [f.name, f.path, f.count, ids(f.assets), f.folders.length]), [["Kicks", "Drums/Kicks", 2, ["pf_k1", "pf_k2"], 0]]);
  assert.equal(pacs.find((p) => p.id === "fs-midi").folders, null);
  assert.deepEqual(ids(stacc.filter(list, { q: "kicks" })), ["pf_k1", "pf_k2"], "search finds folder names");
});

test("a Studio product's pack (its Pac isn't in the catalog) keeps its folders under the product", () => {
  const studio = [{ productId: "sp_1", title: "Drum Kit", projectId: "pj_studio", pacs: ["pc_studio"], files: [
    file("pf_s1", "Snare.wav", { pacId: "pc_studio", folderPath: "Drums" }),
    file("pf_s2", "Notes.txt", { pacId: "pc_studio", folderPath: "" })
  ] }];
  const product = stacc.tree(stacc.assetsFrom(studio, catalog), catalog)[0].products[0];
  assert.equal(product.id, "sp_1");
  assert.deepEqual(ids(product.folders.assets), ["pf_s2"]);
  assert.deepEqual(product.folders.folders.map((f) => [f.path, ids(f.assets)]), [["Drums", ["pf_s1"]]]);
  assert.equal(stacc.tree(stacc.assetsFrom(items, catalog), catalog)[0].products[0].folders, null, "loose files keep content types");
});

test("a file removed in an update says until when, and its Pac shows it was updated", () => {
  const list = stacc.assetsFrom([{ productId: "fs-pack", title: "Frayed Signals Pack", projectId: "gs", pacs: ["fs-samples"], files: [
    file("pf_old", "Old.wav", { pacId: "fs-samples", retiredAt: "2026-10-01T00:00:00.000Z", availableUntil: "2026-10-31T00:00:00.000Z" }),
    file("pf_new", "New.wav", { pacId: "fs-samples" })
  ] }], catalog);
  assert.equal(list.find((a) => a.id === "pf_old").availableUntil, "2026-10-31T00:00:00.000Z");
  assert.equal(list.find((a) => a.id === "pf_new").availableUntil, null);
  assert.equal(stacc.tree(list, catalog)[0].stacclets[0].pacs[0].updated, true);
});

test("a person's own collections and tags: by item key (the asset across versions), filterable and searchable", () => {
  const owned = [{ productId: "fs-pack", title: "Frayed Signals Pack", projectId: "gs", pacs: ["fs-samples"], files: [
    file("pf_a", "Kick.wav", { pacId: "fs-samples", assetId: "as_kick" }),
    file("pf_b", "Snare.wav", { pacId: "fs-samples" })
  ] }];
  const personal = { tags: { as_kick: ["punchy"], pf_b: ["punchy", "dark"] }, collections: [{ id: "cl_1", items: ["as_kick"] }] };
  const list = stacc.assetsFrom(owned, catalog, personal);
  assert.deepEqual(list.map((a) => [a.key, a.tags, a.collections]), [["as_kick", ["punchy"], ["cl_1"]], ["pf_b", ["punchy", "dark"], []]]);
  assert.deepEqual(ids(stacc.filter(list, { collection: "cl_1" })), ["pf_a"]);
  assert.deepEqual(ids(stacc.filter(list, { tag: "dark" })), ["pf_b"]);
  assert.deepEqual(ids(stacc.filter(list, { q: "punchy" })), ["pf_a", "pf_b"], "search finds your tags");
  assert.deepEqual(stacc.facets(list).tags, [["dark", 1], ["punchy", 2]]);
  assert.deepEqual(stacc.assetsFrom(owned, catalog).map((a) => a.tags), [[], []], "no personal data: nothing personal");
});

test("folders nest as a tree: folders inside folders, files at every level, sorted folder names, file order kept", () => {
  const list = stacc.assetsFrom([{ productId: "sp_2", title: "Big Kit", projectId: "pj_x", pacs: ["pc_x"], files: [
    file("pf_1", "Snare 02.wav", { pacId: "pc_x", folderPath: "Drums/Snares" }),
    file("pf_2", "Snare 01.wav", { pacId: "pc_x", folderPath: "Drums/Snares" }),
    file("pf_3", "Crash.wav", { pacId: "pc_x", folderPath: "Drums" }),
    file("pf_4", "Kick.wav", { pacId: "pc_x", folderPath: "Drums/Kicks/Hard" }),
    file("pf_5", "Bass.mid", { pacId: "pc_x", folderPath: "Bass" }),
    file("pf_6", "Odd.wav", { pacId: "pc_x", folderPath: "/Drums//Snares/" })
  ] }], catalog);
  const root = stacc.foldersOf(list);
  assert.deepEqual([root.name, root.path, root.count, ids(root.assets)], ["", "", 6, []]);
  assert.deepEqual(root.folders.map((f) => [f.name, f.count]), [["Bass", 1], ["Drums", 5]]);
  const drums = root.folders[1];
  assert.deepEqual(ids(drums.assets), ["pf_3"]);
  assert.deepEqual(drums.folders.map((f) => [f.path, f.count, ids(f.assets)]), [["Drums/Kicks", 1, []], ["Drums/Snares", 3, ["pf_1", "pf_2", "pf_6"]]]);
  assert.deepEqual(drums.folders[0].folders.map((f) => [f.path, ids(f.assets)]), [["Drums/Kicks/Hard", ["pf_4"]]]);
  assert.ok(root.folders.every((f) => !("kids" in f)), "no working maps left behind (the tree is posted from the worker)");
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(root))), JSON.stringify(root), "plain data");
  assert.equal(stacc.foldersOf(stacc.assetsFrom(items, catalog)), null);
});

test("each Pac carries its own previews (at most 3) and its product's read me; loose products carry theirs", () => {
  const owned = [
    { productId: "fs-pack", title: "Frayed Signals Pack", projectId: "gs", pacs: ["fs-midi", "fs-samples"], readme: "Thanks!\nUse freely.",
      previews: [1, 2, 3, 4].map((n) => ({ pacId: "fs-samples", title: `Clip ${n}`, url: `/media/previews/c${n}.mp3` }))
        .concat([{ pacId: "fs-midi", title: "Bad", url: "javascript:alert(1)" }, { pacId: "fs-midi", title: "Elsewhere", url: "https://evil.test/a.mp3" }, { pacId: "fs-midi", title: "Midi", url: "/media/previews/m.mp3" }]),
      files: [file("pf_m", "Bass.mid", { pacId: "fs-midi" }), file("pf_k", "Kick.wav", { pacId: "fs-samples" })] },
    { productId: "sp_1", title: "Drum Kit", projectId: "pj_studio", pacs: ["pc_s"], readme: "   ", previews: [{ pacId: "pc_s", title: "Loop", url: "/media/previews/l.mp3" }],
      files: [file("pf_s", "Snare.wav", { pacId: "pc_s", folderPath: "Drums" })] },
    { productId: "kit", title: "Kit", projectId: "two", pacs: ["kit-presets"], files: [file("pf_p", "Pad.fxp", { pacId: "kit-presets" })] }
  ];
  const memo = {};
  stacc.answer(memo, { type: "build", items: owned, catalog });
  const view = stacc.answer(memo, { type: "view", view: "projects", filter: {} });
  const pacs = view.groups[0].stacclets[0].pacs;
  const samples = pacs.find((p) => p.id === "fs-samples"), midi = pacs.find((p) => p.id === "fs-midi");
  assert.deepEqual(samples.previews.map((c) => c.title), ["Clip 1", "Clip 2", "Clip 3"], "three per Pac");
  assert.deepEqual(midi.previews.map((c) => c.url), ["/media/previews/m.mp3"], "only the Pac's own, only /media/ addresses");
  assert.equal(samples.readme, "Thanks!\nUse freely.");
  const studio = view.groups.find((p) => p.id === "pj_studio").products[0];
  assert.deepEqual([studio.readme, studio.previews.map((c) => c.title)], [null, ["Loop"]], "a blank read me counts as none");
  const kit = view.groups.find((p) => p.id === "two").stacclets[0].pacs[0];
  assert.deepEqual([kit.readme, kit.previews], [null, []]);
  assert.deepEqual(stacc.tree(stacc.assetsFrom(owned, catalog), catalog)[0].stacclets[0].pacs[0].previews, [], "no extras given: none shown");
});

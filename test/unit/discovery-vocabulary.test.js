// The store's controlled vocabulary (server/discovery/vocabulary.js): synonyms fold into one value, fields apply only to
// the kinds they mean something for, suggestions come only from the product's own words, and the browser's copy
// (data/vocabulary.js, generated) and the Studio's kinds match it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import * as V from "../../server/discovery/vocabulary.js";
import { SELLING } from "../../server/creators/policy.js";

test("words fold into canonical values: case, punctuation, synonyms and labels", () => {
  assert.equal(V.canonical("genre", "DnB"), "drum-and-bass");
  assert.equal(V.canonical("genre", "Drum & Bass"), "drum-and-bass");
  assert.equal(V.canonical("genre", "HIP HOP"), "hip-hop");
  assert.equal(V.canonical("key", "C# minor"), "cs-minor");
  assert.equal(V.canonical("daw", "Ableton"), "ableton-live");
  assert.equal(V.canonical("format", ".wav"), "wav");
  assert.equal(V.canonical("genre", "polka"), null);
  assert.equal(V.canonical("nope", "house"), null);
});

test("details are cleaned per kind: duplicates merge, unknown and inapplicable values are errors, single-value fields take one", () => {
  const r = V.cleanFacets("sample-pack", { genre: ["EDM", "edm", "Electronic"], contents: ["one-shot", "Loops"] });
  assert.deepEqual(r, { facets: { genre: ["edm", "electronic"], contents: ["one-shots", "loops"] }, errors: [] });
  assert.match(V.cleanFacets("sample-pack", { plugin: ["Serum"] }).errors[0], /doesn't apply/);
  assert.match(V.cleanFacets("visuals", { genre: ["house"] }).errors[0], /doesn't apply/);
  assert.match(V.cleanFacets("sample-pack", { genre: ["polka"] }).errors[0], /isn't a known genre/);
  assert.match(V.cleanFacets("sample-pack", { energy: ["low", "high"] }).errors[0], /takes one value/);
  assert.match(V.cleanFacets("sample-pack", { whatever: ["x"] }).errors[0], /unknown field/);
});

test("BPM and specs: whole numbers in range, only for kinds that have them", () => {
  assert.deepEqual(V.cleanBpm("sample-pack", [120, 128]).bpm, [120, 128]);
  assert.deepEqual(V.cleanBpm("stems", 140).bpm, [140, 140]);
  assert.equal(V.cleanBpm("sample-pack", null).bpm, null);
  assert.ok(V.cleanBpm("sample-pack", [128, 120]).errors.length, "low to high");
  assert.ok(V.cleanBpm("sample-pack", [10, 20]).errors.length, "in range");
  assert.ok(V.cleanBpm("visuals", 120).errors.length, "visuals have no tempo");
  assert.deepEqual(V.cleanSpecs("sample-pack", { bitDepth: 24, sampleRate: "48000" }).specs, { bitDepth: 24, sampleRate: 48000 });
  assert.ok(V.cleanSpecs("sample-pack", { bitDepth: 12 }).errors.length);
  assert.ok(V.cleanSpecs("presets", { bitDepth: 24 }).errors.length);
});

test("suggestions come only from words in the text, and only for fields the kind has", () => {
  const s = V.suggestFacets("sample-pack", "300+ one-shots, glitch loops and vocal chops. WAV, 24-bit.");
  assert.deepEqual(s.contents.sort(), ["loops", "one-shots", "vocals"]);
  assert.deepEqual(s.format, ["wav"]);
  assert.equal(s.plugin, undefined);
  assert.deepEqual(V.suggestFacets("sample-pack", "Nothing in particular."), {});
});

test("search text holds the labels a buyer would type", () => {
  const t = V.searchText({ title: "Kit", description: "Drums", tags: ["crunchy"], facets: { genre: ["drum-and-bass"], format: ["wav"] }, by: "DX Maker" });
  for (const w of ["kit", "drums", "crunchy", "drum & bass", "wav", "dx maker"]) assert.ok(t.includes(w), w);
});

test("the browser's vocabulary is generated from this one, and every Studio kind has a schema", () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(import.meta.dirname, "../../data/vocabulary.js"), "utf8"), ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.VOCABULARY)), JSON.parse(JSON.stringify(V.browserVocabulary())));
  assert.deepEqual(Object.keys(V.SCHEMAS).sort(), [...SELLING.kinds].sort());
  for (const s of Object.values(V.SCHEMAS)) for (const f of s.facets) assert.ok(V.FACETS[f], f);
});

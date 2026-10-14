// What a product's files contain (server/discovery/contents.js deriveContents): counted from each file's published
// details, only known vocabulary values, a tempo range from the files' BPM values, and a file's kind folded to the
// store's contents facet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveContents } from "../../server/discovery/contents.js";

const file = (name, meta, extra = {}) => ({ filename: name, size_bytes: 100, kind: "", meta: JSON.stringify(meta), ...extra });

test("counts each value once per file, from published details only", () => {
  const c = deriveContents([
    file("Kick.wav", { format: "wav", facts: { sampleRate: 44100, bitDepth: 24 }, values: { kind: { value: "one-shots" }, instrument: { value: "kick" } } }),
    file("Loop 128.wav", { format: "wav", facts: { sampleRate: 48000, bitDepth: 24 }, values: { kind: { value: "loops" }, bpm: { value: "128" }, key: { value: "a-minor" } } }),
    file("Loop 90.wav", { format: "wav", facts: { sampleRate: 48000, bitDepth: 16 }, values: { kind: { value: "loops" }, bpm: { value: "90" } } }),
    file("Lead.vital", { format: "vital", values: { kind: { value: "presets" } } }),
    file("Set.als", { format: "als", values: {} }, { kind: "samples" })
  ]);
  assert.equal(c.files, 5);
  assert.equal(c.bytes, 500);
  assert.deepEqual(c.facets.format, { wav: 3, "vital-preset": 1 });
  assert.deepEqual(c.facets["sample-rate"], { 44100: 1, 48000: 2 });
  assert.deepEqual(c.facets["bit-depth"], { 24: 2, 16: 1 });
  assert.deepEqual(c.facets.contents, { "one-shots": 2, loops: 2, presets: 1 }, "an old kind name folds to its value");
  assert.deepEqual(c.facets.instrument, { kick: 1 });
  assert.deepEqual(c.facets.key, { "a-minor": 1 });
  assert.deepEqual(c.facets.plugin, { vital: 1 });
  assert.deepEqual(c.facets.daw, { "ableton-live": 1 });
  assert.deepEqual(c.bpm, [90, 128]);
});

test("unknown values and out-of-range tempos are left out; no files, nothing", () => {
  const c = deriveContents([file("x.wav", { format: "wav", facts: { sampleRate: 22050, bitDepth: 8 }, values: { instrument: { value: "kazoo" }, bpm: { value: "999" }, key: { value: "h-minor" } } })]);
  assert.equal(c.facets["sample-rate"], undefined);
  assert.equal(c.facets["bit-depth"], undefined);
  assert.equal(c.facets.instrument, undefined);
  assert.equal(c.facets.key, undefined);
  assert.equal(c.bpm, null);
  assert.deepEqual(deriveContents([]), { files: 0, bytes: 0, kinds: {}, facets: {}, bpm: null });
});

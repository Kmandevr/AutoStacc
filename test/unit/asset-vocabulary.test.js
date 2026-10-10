// One vocabulary for assets (server/discovery/vocabulary.js FORMATS, KINDS): the upload allow-list
// (server/files/policy.js), the processing engine's format table (engine/src/formats.rs) and the browser's kinds
// (data/content-types.js, generated) all agree with it, and old kind names still mean their kind.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as V from "../../server/discovery/vocabulary.js";
import { ALLOWED_EXTENSIONS } from "../../server/files/policy.js";

const ROOT = path.join(import.meta.dirname, "..", "..");

test("every format's extensions may be uploaded, and every allowed extension is a known format", () => {
  for (const [f, x] of Object.entries(V.FORMATS)) for (const e of x.ext) assert.ok(ALLOWED_EXTENSIONS.has(e), `${e} (${f}) must be in server/files/policy.js FILE_TYPES`);
  for (const e of ALLOWED_EXTENSIONS) assert.ok(V.formatOfExtension(e), `.${e} is allowed for upload but isn't in FORMATS`);
  const all = Object.values(V.FORMATS).flatMap((x) => x.ext);
  assert.equal(new Set(all).size, all.length, "an extension belongs to one format");
});

test("the engine identifies extensions with the same slugs (engine/src/formats.rs)", () => {
  const rs = fs.readFileSync(path.join(ROOT, "engine/src/formats.rs"), "utf8");
  const body = rs.slice(rs.indexOf("fn by_extension"), rs.indexOf("fn has_signature"));
  const engine = {};
  for (const [, exts, slug] of body.matchAll(/((?:"[a-z0-9]+"\s*\|?\s*)+)=>\s*"([a-z0-9-]+)"/g)) {
    for (const [, e] of exts.matchAll(/"([a-z0-9]+)"/g)) engine[e] = slug;
  }
  for (const [f, x] of Object.entries(V.FORMATS)) for (const e of x.ext) assert.equal(engine[e], f, `engine maps .${e} to ${engine[e]}, vocabulary to ${f}`);
  for (const e of Object.keys(engine)) assert.ok(V.formatOfExtension(e), `engine knows .${e}, the vocabulary doesn't`);
});

test("kinds use known formats once each, and map to store facets that exist", () => {
  const seen = new Set();
  for (const [k, x] of Object.entries(V.KINDS)) {
    for (const f of x.formats) {
      assert.ok(V.FORMATS[f], `${k}: unknown format ${f}`);
      assert.ok(!seen.has(f), `${f} is the default of two kinds`);
      seen.add(f);
    }
    if (x.contents) assert.ok(V.FACETS.contents.values[x.contents], `${k}: contents value ${x.contents}`);
  }
  for (const [f, x] of Object.entries(V.FORMATS)) if (x.facet) assert.ok(V.FACETS.format.values[x.facet], `${f}: format facet ${x.facet}`);
  for (const [word, kind] of Object.entries(V.KIND_SYNONYMS)) assert.ok(V.KINDS[kind], `${word} → ${kind}`);
});

test("old and casual names resolve to one kind", () => {
  assert.equal(V.kindOf("samples"), "one-shots");
  assert.equal(V.kindOf("One Shot"), "one-shots");
  assert.equal(V.kindOf("MIDI Patterns"), "midi");
  assert.equal(V.kindOf("loops"), "loops");
  assert.equal(V.kindOf("banana"), null);
  assert.equal(V.formatOfExtension("WAV"), "wav");
  assert.equal(V.formatOfExtension("nkx"), "kontakt");
});

test("the browser's content types are generated from the vocabulary", () => {
  const window = {};
  new Function("window", fs.readFileSync(path.join(ROOT, "data/content-types.js"), "utf8"))(window);
  assert.deepEqual(window.CONTENT_TYPES, V.contentTypes().types);
  assert.deepEqual(window.CONTENT_TYPE_ALIASES, V.contentTypes().aliases);
  assert.ok(window.CONTENT_TYPES["one-shots"].formats.includes("wav"));
});

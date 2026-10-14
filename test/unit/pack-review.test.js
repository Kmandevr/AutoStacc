// Automated review (server/packs/review.js): each red flag with its reason; hard flags always hold, soft ones hold
// unless the creator is trusted, and "always hold" holds everything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { review, clearToPublish } from "../../server/packs/review.js";

const kept = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ path: `P/f${i}.wav`, format: "wav", sha256: String(i).repeat(64).slice(0, 64), size: 100, ...extra }));
const codes = (rv) => rv.flags.map((f) => f.code).sort();

test("a clean pack passes", () => {
  const rv = review({ result: { files: kept(3) }, kept: kept(3), refused: [] });
  assert.deepEqual(rv, { verdict: "pass", flags: [] });
  assert.equal(clearToPublish(rv), true);
});

test("hard flags: unsafe, deceptive, damaged, encrypted entries and executables always hold", () => {
  const refused = [
    { path: "../x.wav", codes: ["path_traversal"] }, { path: "P/fake.wav", codes: ["content_does_not_match_name"] },
    { path: "P/bad.wav", codes: ["crc_mismatch"] }, { path: "P/locked.wav", codes: ["encrypted"] }
  ];
  const rv = review({ result: { files: [...kept(2), { path: "P/setup.exe" }] }, kept: kept(2), refused });
  assert.deepEqual(codes(rv), ["damaged_files", "deceptive_files", "encrypted_files", "executables", "unsafe_entries"]);
  assert.ok(rv.flags.every((f) => f.hard));
  assert.equal(clearToPublish(rv, { trusted: true }), false, "trust never skips a hard flag");
});

test("soft flags hold unless the creator is trusted; always-hold holds everything", () => {
  const unknown = kept(3, { format: "unknown" });
  const rv = review({ result: { files: unknown }, kept: unknown, refused: [{ path: "P/x.xyz", codes: ["unsupported_type"] }], existingHashes: 3 });
  assert.deepEqual(codes(rv), ["all_duplicates", "mostly_unknown_formats", "unsupported_files"]);
  assert.ok(rv.flags.every((f) => !f.hard));
  assert.equal(clearToPublish(rv), false);
  assert.equal(clearToPublish(rv, { trusted: true }), true);
  assert.equal(clearToPublish({ verdict: "pass", flags: [] }, { alwaysHold: true }), false);
  assert.equal(clearToPublish(null, { trusted: true }), false, "no review at all holds");
});

test("a revision that removes over a quarter of the files or takes away over half the bytes is flagged", () => {
  const rv = (revision) => codes(review({ result: { files: kept(3) }, kept: kept(3), refused: [], revision }));
  assert.deepEqual(rv({ files: 4, bytes: 400, removed: 1, goneBytes: 200 }), [], "a quarter, half: not over");
  assert.deepEqual(rv({ files: 4, bytes: 400, removed: 2, goneBytes: 200 }), ["big_revision"]);
  assert.deepEqual(rv({ files: 4, bytes: 400, removed: 0, goneBytes: 201 }), ["big_revision"], "replacing most of the bytes counts too");
});

test("an archive inside the pack is a soft flag: its contents weren't checked", () => {
  const files = [...kept(1), { path: "P/tools.zip", format: "zip", sha256: "f".repeat(64), size: 10 }];
  const rv = review({ result: { files }, kept: files, refused: [] });
  assert.deepEqual(codes(rv), ["nested_archives"]);
  assert.equal(clearToPublish(rv), false);
  assert.equal(clearToPublish(rv, { trusted: true }), true);
});

test("audio that is largely silent or won't decode holds; a stray file doesn't", () => {
  const heard = kept(8, { analysis: { peaks: [50], analyzedMs: 1000 } });
  const silent = (f) => ({ ...f, issues: [{ code: "silent_audio", refused: false }] });
  const broken = (f) => ({ path: f.path, format: "wav", sha256: f.sha256, size: 100, issues: [{ code: "audio_does_not_decode", refused: false }] });
  const one = [silent(heard[0]), broken(heard[1]), ...heard.slice(2)];
  assert.deepEqual(review({ result: { files: one }, kept: one, refused: [] }).flags, [], "one of each in eight is normal");
  const many = [...heard.slice(0, 3).map(silent), ...heard.slice(3, 6).map(broken), ...heard.slice(6)];
  const rv = review({ result: { files: many }, kept: many, refused: [] });
  assert.deepEqual(codes(rv), ["silent_audio", "undecodable_audio"]);
  assert.ok(rv.flags.every((f) => !f.hard && f.count === 3));
  // Too few files to call it a share: one broken file of two holds nothing.
  const pair = [broken(heard[0]), heard[1]];
  assert.deepEqual(review({ result: { files: pair }, kept: pair, refused: [] }).flags, []);
  // Without analysis (switched off) nothing is heard, so nothing is flagged.
  assert.deepEqual(review({ result: { files: kept(4) }, kept: kept(4), refused: [] }).flags, []);
});

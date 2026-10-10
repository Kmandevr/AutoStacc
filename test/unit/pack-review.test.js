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

test("a revision that drops over a quarter of the files or half the bytes is flagged", () => {
  const before = Object.fromEntries(kept(4).map((f) => [f.sha256, f.size]));
  assert.deepEqual(codes(review({ result: { files: kept(3) }, kept: kept(3), refused: [], previous: before })), []);
  assert.deepEqual(codes(review({ result: { files: kept(2) }, kept: kept(2), refused: [], previous: before })), ["big_revision"]);
});

test("an archive inside the pack is a soft flag: its contents weren't checked", () => {
  const files = [...kept(1), { path: "P/tools.zip", format: "zip", sha256: "f".repeat(64), size: 10 }];
  const rv = review({ result: { files }, kept: files, refused: [] });
  assert.deepEqual(codes(rv), ["nested_archives"]);
  assert.equal(clearToPublish(rv), false);
  assert.equal(clearToPublish(rv, { trusted: true }), true);
});

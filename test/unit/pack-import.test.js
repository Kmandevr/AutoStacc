// Pack Builder import (server/packs/import.js acceptStored): only files the engine accepted AND the storage relay
// recorded under this job's own prefix, with the same hash and size, are kept. An engine can't point a version at an
// object it didn't write in this job (another owner's paid file, another job's), nor at bytes it misreports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptStored } from "../../server/packs/import.js";

const sha = (c) => c.repeat(64);
const prefix = "blobs/cr_me/pj_job1/1/";
const writes = { 1: { sha256: sha("a"), size: 10 }, 2: { sha256: sha("b"), size: 20 } };
const file = (path, stored, sha256, size, extra = {}) => ({ path, stored, sha256, size, issues: [], ignored: false, ...extra });

test("keeps a file only when the engine and the relay agree on its key, hash and size", () => {
  const { kept, refused } = acceptStored([
    file("P/a.wav", `${prefix}1`, sha("a"), 10),
    file("P/b.wav", `${prefix}2`, sha("c"), 20),
    file("P/c.wav", `${prefix}2`, sha("b"), 21),
    file("P/d.wav", `${prefix}3`, sha("a"), 10)
  ], writes, prefix);
  assert.deepEqual(kept.map((f) => [f.path, f.stored]), [["P/a.wav", `${prefix}1`]]);
  assert.deepEqual(refused.map((r) => [r.path, r.codes]), [["P/b.wav", ["storage_mismatch"]], ["P/c.wav", ["storage_mismatch"]], ["P/d.wav", ["storage_mismatch"]]]);
});

test("an answer naming another owner's or another job's object is refused, whatever its hash", () => {
  for (const stored of ["blobs/cr_other/pj_x/1/1", "blobs/cr_me/pj_job2/1/1", "blobs/cr_me/pj_job1/2/1", `${prefix}0x1`, `${prefix} 1`,
    `${prefix}1/../1`, `products/p/file.wav`, `x${prefix}1`, 1, null]) {
    const { kept, refused } = acceptStored([file("P/a.wav", stored, sha("a"), 10)], writes, prefix);
    assert.equal(kept.length, 0, String(stored));
    assert.equal(refused.length, 1, String(stored));
  }
});

test("refused and ignored files never count, stored or not", () => {
  const { kept, refused } = acceptStored([
    file("P/fake.wav", `${prefix}1`, sha("a"), 10, { issues: [{ code: "content_does_not_match_name", refused: true }] }),
    file("__MACOSX/._x", `${prefix}2`, sha("b"), 20, { ignored: true }),
    file("P/unread.wav", undefined, undefined, 5)
  ], writes, prefix);
  assert.equal(kept.length, 0);
  assert.deepEqual(refused.map((r) => r.codes), [["content_does_not_match_name"], ["not_stored"]]);
});

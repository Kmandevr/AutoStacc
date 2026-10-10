// The engine Worker's job checks (workers/engine/src/jobs.js): only well-formed jobs on allowed buckets reach the
// processing engine, answers land at fixed R2 keys, and the smoke-test routes need the exact admin token.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkJob, engineRequest, resultKey, tokenMatches, buckets, storageRequest } from "../../workers/engine/src/jobs.js";

const ok = { jobId: "abcdef0123456789", op: "inspect", bucket: "autostacc-files", key: "incoming/v1/pack.zip" };

test("accepts a well-formed job and maps it to the engine's request", () => {
  assert.deepEqual(checkJob(ok, ["autostacc-files"]), ok);
  assert.deepEqual(engineRequest(ok), { op: "inspect", source: { bucket: "autostacc-files", key: "incoming/v1/pack.zip" } });
  assert.equal(resultKey(ok.jobId), "jobs/abcdef0123456789/result.json");
});

test("refuses other buckets, unknown operations, odd ids and keys", () => {
  const allowed = ["autostacc-files"];
  for (const bad of [
    { ...ok, bucket: "autostacc-previews" },
    { ...ok, op: "delete" },
    { ...ok, jobId: "../x" },
    { ...ok, jobId: "short" },
    { ...ok, key: "a/../b" },
    { ...ok, key: "" },
    { ...ok, path: 42 },
    null
  ]) assert.throws(() => checkJob(bad, allowed));
});

test("admin token: exact match only, and never when unset or short", () => {
  const t = "x".repeat(40);
  assert.equal(tokenMatches(`Bearer ${t}`, t), true);
  assert.equal(tokenMatches(`Bearer ${t}y`, t), false);
  assert.equal(tokenMatches("", t), false);
  assert.equal(tokenMatches("Bearer ", ""), false);
  assert.equal(tokenMatches("Bearer short", "short"), false);
});

test("bucket list from the environment", () => {
  assert.deepEqual(buckets({ R2_BUCKETS: " a, b ,," }), ["a", "b"]);
  assert.deepEqual(buckets({}), []);
});

test("storage reads from the engine: allowed buckets only, GET or HEAD, one byte range", () => {
  const allowed = ["autostacc-files"];
  const read = (url, method = "GET", range) => storageRequest(method, `http://storage.engine${url}`, range, allowed);
  assert.deepEqual(read("/autostacc-files/incoming/v%201/Kick%20(1).wav"), { bucket: "autostacc-files", key: "incoming/v 1/Kick (1).wav", head: false });
  assert.deepEqual(read("/autostacc-files/incoming/p.zip", "HEAD"), { bucket: "autostacc-files", key: "incoming/p.zip", head: true });
  assert.deepEqual(read("/autostacc-files/incoming/p.zip", "GET", "bytes=8-15").range, { offset: 8, length: 8 });
  assert.equal(read("/autostacc-previews/a.wav").status, 403);
  assert.equal(read("/autostacc-files/incoming/p.zip", "PUT").status, 405);
  assert.equal(read("/autostacc-files/incoming/p.zip", "DELETE").status, 405);
  assert.equal(read("/autostacc-files/a/..%2Fb").status, 400);
  assert.equal(read("/autostacc-files/a/%E0%A4%A").status, 400);
  assert.equal(read("/autostacc-files/").status, 400);
  assert.equal(read("/autostacc-files/Kick%20%231.wav").status, 400);
  for (const r of ["bytes=5-1", "bytes=0-", "bytes=0-1,4-5", "items=0-1"]) assert.equal(read("/autostacc-files/p.zip", "GET", r).status, 416);
});

test("a vocabulary rides along to the engine, within a size limit", () => {
  const vocabulary = { kinds: {}, words: { kind: {}, instrument: {}, midiRole: {} }, keys: [], bpm: { min: 40, max: 250 } };
  const job = checkJob({ ...ok, vocabulary }, ["autostacc-files"]);
  assert.deepEqual(engineRequest(job).vocabulary, vocabulary);
  assert.equal(engineRequest(ok).vocabulary, undefined);
  for (const bad of [[], "words", null, { big: "x".repeat(70 * 1024) }]) assert.throws(() => checkJob({ ...ok, vocabulary: bad }, ["autostacc-files"]));
});

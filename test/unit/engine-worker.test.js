// The engine Worker's job checks (workers/engine/src/jobs.js): only well-formed jobs on allowed buckets reach the
// processing engine, answers land at fixed R2 keys, and the smoke-test routes need the exact admin token.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkJob, engineRequest, resultKey, tokenMatches, buckets } from "../../workers/engine/src/jobs.js";

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

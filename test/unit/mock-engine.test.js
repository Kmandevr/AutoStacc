// The stand-in engine (test/mock-engine/server.js) keeps the same contract as the real one: the conformance suite
// (scripts/engine-conformance.js) passes against it, and it refuses what the real service refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { startMockEngine } from "../mock-engine/server.js";

const ROOT = path.join(import.meta.dirname, "..", "..");

test("the mock engine passes the engine conformance suite", async () => {
  const mock = await startMockEngine();
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [path.join(ROOT, "scripts/engine-conformance.js"), "--http", mock.url]);
    assert.match(stdout, /all passed/);
  } finally {
    await mock.close();
  }
});

test("the mock engine refuses bad jobs like the real service", async () => {
  const mock = await startMockEngine();
  try {
    const post = (body) => fetch(`${mock.url}/v1/jobs`, { method: "POST", body });
    assert.equal((await post("nonsense")).status, 400);
    assert.equal((await post(JSON.stringify({ op: "delete", source: { key: "pack-basic.zip" } }))).status, 400);
    assert.equal((await post(JSON.stringify({ op: "inspect", source: { key: "../../etc/passwd" } }))).status, 404);
    const ok = await (await post(JSON.stringify({ op: "list", source: { bucket: "b", key: "incoming/v1/pack-basic.zip" } }))).json();
    assert.equal(ok.contractVersion, 1);
    assert.equal((await fetch(`${mock.url}/healthz`)).status, 200);
  } finally {
    await mock.close();
  }
});

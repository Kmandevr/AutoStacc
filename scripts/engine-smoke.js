// Smoke test of the deployed engine (docs/engine.md), run by the Engine workflow after a deploy: asks the engine Worker
// for its health (this starts the Container: cold-start time), queues an inspect job for a conformance case already
// uploaded to R2, waits for the answer and checks it equals the expected one. Prints timings. Needs the Worker's address
// and ENGINE_ADMIN_TOKEN. Usage: ENGINE_ADMIN_TOKEN=... node scripts/engine-smoke.js <worker-url> <bucket> <key> <case>
const fs = require("fs");
const path = require("path");

const [base, bucket, key, name] = process.argv.slice(2);
const token = process.env.ENGINE_ADMIN_TOKEN;
if (!base || !bucket || !key || !name || !token) {
  console.error("usage: ENGINE_ADMIN_TOKEN=... node scripts/engine-smoke.js <worker-url> <bucket> <key> <case>");
  process.exit(64);
}
const auth = { Authorization: `Bearer ${token}` };
const normal = (v) => {
  if (Array.isArray(v)) return v.map(normal);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) if (k !== "engineVersion" && k !== "elapsedMs") out[k] = normal(v[k]);
    return out;
  }
  return v;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let t = Date.now();
  const health = await fetch(`${base}/v1/health`, { headers: auth });
  const healthBody = await health.text();
  const coldMs = Date.now() - t;
  console.log(`health ${health.status} in ${coldMs} ms (includes the Container's cold start): ${healthBody}`);
  if (!health.ok) process.exit(1);

  t = Date.now();
  const queued = await fetch(`${base}/v1/jobs`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ op: "inspect", bucket, key }) });
  const { jobId } = await queued.json();
  if (queued.status !== 202 || !jobId) { console.error(`queueing failed: ${queued.status}`); process.exit(1); }
  fs.writeFileSync("/tmp/smoke-job", jobId); // so the workflow can delete the answer afterwards
  let res;
  for (let i = 0; i < 90; i++) {
    res = await fetch(`${base}/v1/jobs/${jobId}`, { headers: auth });
    if (res.status === 200) break;
    await sleep(2000);
  }
  const answer = await res.json();
  const totalMs = Date.now() - t;
  if (answer.status === "failed" || res.status !== 200) { console.error(`job ${jobId} ${answer.status || res.status}`); process.exit(1); }
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "engine/conformance/expected", `${name}.inspect.json`), "utf8"));
  const same = JSON.stringify(normal(answer)) === JSON.stringify(expected);
  console.log(`job ${jobId}: queued to answer ${totalMs} ms; engine ${answer.elapsedMs} ms inside the Container; worker wall ${res.headers.get("x-engine-wall-ms")} ms; waited ${res.headers.get("x-engine-queue-ms")} ms in the queue; attempt ${res.headers.get("x-engine-attempts")}`);
  console.log(same ? `PASS the deployed engine's answer for ${name} equals the expected one` : `FAIL the deployed engine's answer for ${name} differs from the expected one`);
  process.exit(same ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(1); });

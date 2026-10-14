// A stand-in engine for tests that don't need the real one (no Rust, no Docker): the same HTTP contract as the Container's
// service (engine/src/serve.rs), answering each job with the expected answer of the conformance case it names
// (engine/conformance/expected/<case>.<op>.json, or <case>.suggest.json for an inspect sent with a vocabulary and
// <case>.analyze.json with analysis too, matched by
// the source file's or key's name). Unknown sources are 404.
// It passes `node scripts/engine-conformance.js --http` like the real engine (test/unit/mock-engine.test.js), so tests
// built on it test the contract, not a guess. A `process` job (store each accepted original) needs a storage service
// (startMockEngine(port, { storage }): the store's stand-in relay in the API tests): the uploaded archive is recognised
// as a conformance case by its hash, and each file the expected answer accepts is written there like the real engine
// does (PUT <prefix><n>, n from 1). startMockEngine() → { url, close() }; or run it: node test/mock-engine/server.js [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

const EXPECTED = path.join(import.meta.dirname, "..", "..", "engine", "conformance", "expected");
const CASES = path.join(import.meta.dirname, "..", "..", "engine", "conformance", "cases");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const caseByHash = new Map(fs.readdirSync(CASES).filter((f) => f.endsWith(".zip")).map((f) => [sha(fs.readFileSync(path.join(CASES, f))), f.replace(/\.zip$/, "")]));

// Each entry's bytes by name, from the archive's central directory (store and deflate only, as in the cases).
export function entries(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let p = zip.readUInt32LE(end + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10), csize = zip.readUInt32LE(p + 20), nlen = zip.readUInt16LE(p + 28);
    const elen = zip.readUInt16LE(p + 30), clen = zip.readUInt16LE(p + 32), lho = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nlen).toString("utf8");
    const data = zip.subarray(lho + 30 + zip.readUInt16LE(lho + 26) + zip.readUInt16LE(lho + 28)).subarray(0, csize);
    if (!out.has(name)) out.set(name, () => (method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data)));
    p += 46 + nlen + elen + clen;
  }
  return out;
}

// Which expected answer a job gets: "analyze" for one with the vocabulary and analysis, "suggest" with the vocabulary only.
const checkOf = (job) => job.op === "list" || job.op === "file" ? job.op : job.vocabulary ? (job.analyze ? "analyze" : "suggest") : "inspect";

async function processJob(job, storage) {
  const src = await fetch(`${storage}/${job.source.bucket}/${job.source.key}`);
  if (src.status === 404) return [404, { error: "not_found" }];
  const zip = Buffer.from(await src.arrayBuffer());
  const name = caseByHash.get(sha(zip));
  if (!name) return [404, { error: "not_found" }];
  const answer = JSON.parse(fs.readFileSync(path.join(EXPECTED, `${name}.${checkOf(job)}.json`), "utf8"));
  if (answer.error) return [422, answer];
  const files = entries(zip);
  let n = 0;
  for (const f of answer.files) {
    if (f.ignored || !f.sha256 || (f.issues || []).some((i) => i.refused) || !files.has(f.path)) continue;
    const body = files.get(f.path)();
    const key = `${job.target.prefix}${++n}`;
    const res = await fetch(`${storage}/${job.target.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`, {
      method: "PUT", body, headers: { "Content-Length": String(body.length) }
    });
    if (res.status === 201) f.stored = key;
  }
  return [200, answer];
}
const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };

export function startMockEngine(port = 0, { storage } = {}) {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz") return json(res, 200, { ok: true, engineVersion: "mock", contractVersion: 1 });
    if (req.method !== "POST" || req.url !== "/v1/jobs") return json(res, 404, { error: "not_found" });
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1 << 20) req.destroy(); });
    req.on("end", () => {
      let job;
      try { job = JSON.parse(body); } catch { return json(res, 400, { error: "bad_request" }); }
      if (job.op === "process") {
        if (!storage || !job.target) return json(res, 400, { error: "bad_target" });
        return processJob(job, storage).then(([status, body]) => json(res, status, { ...body, engineVersion: "mock" }), () => json(res, 502, { error: "storage_unavailable" }));
      }
      if (!["list", "inspect", "file"].includes(job.op)) return json(res, 400, { error: "unknown_op" });
      const ref = (job.source && (job.source.file || job.source.key)) || "";
      const name = path.basename(ref).replace(/\.zip$/, "");
      const file = path.join(EXPECTED, `${name}.${checkOf(job)}.json`);
      if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(file)) return json(res, 404, { error: "not_found" });
      const answer = JSON.parse(fs.readFileSync(file, "utf8"));
      json(res, answer.error ? 422 : 200, { ...answer, engineVersion: "mock" });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const { url } = await startMockEngine(Number(process.argv[2] || 8095));
  console.log(`mock engine on ${url}`);
}

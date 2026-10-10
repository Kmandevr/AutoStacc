// A stand-in engine for tests that don't need the real one (no Rust, no Docker): the same HTTP contract as the Container's
// service (engine/src/serve.rs), answering each job with the expected answer of the conformance case it names
// (engine/conformance/expected/<case>.<op>.json, or <case>.suggest.json for an inspect sent with a vocabulary, matched by
// the source file's or key's name). Unknown sources are 404.
// It passes `node scripts/engine-conformance.js --http` like the real engine (test/unit/mock-engine.test.js), so tests
// built on it test the contract, not a guess. startMockEngine() → { url, close() }; or run it: node test/mock-engine/server.js [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const EXPECTED = path.join(import.meta.dirname, "..", "..", "engine", "conformance", "expected");
const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };

export function startMockEngine(port = 0) {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz") return json(res, 200, { ok: true, engineVersion: "mock", contractVersion: 1 });
    if (req.method !== "POST" || req.url !== "/v1/jobs") return json(res, 404, { error: "not_found" });
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1 << 20) req.destroy(); });
    req.on("end", () => {
      let job;
      try { job = JSON.parse(body); } catch { return json(res, 400, { error: "bad_request" }); }
      if (!["list", "inspect", "file"].includes(job.op)) return json(res, 400, { error: "unknown_op" });
      const ref = (job.source && (job.source.file || job.source.key)) || "";
      const name = path.basename(ref).replace(/\.zip$/, "");
      const check = job.op === "inspect" && job.vocabulary ? "suggest" : job.op;
      const file = path.join(EXPECTED, `${name}.${check}.json`);
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

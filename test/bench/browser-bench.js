// Times the engine's WebAssembly build in headless Chromium on a real File chosen in a page (docs/engine.md): one Web
// Worker doing list / inspect / inspect handing over originals, then 1, 2 and 4 workers splitting the files.
// Usage: node test/bench/browser-bench.js <pack.zip>   (needs the wasm build and the global Playwright install)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = path.join(import.meta.dirname, "..", "..");
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const pack = path.resolve(process.argv[2] || "");
if (!fs.existsSync(pack)) { console.error("usage: node test/bench/browser-bench.js <pack.zip>"); process.exit(64); }

const files = {
  "/": [path.join(import.meta.dirname, "browser/index.html"), "text/html"],
  "/bench-page.js": [path.join(import.meta.dirname, "browser/bench-page.js"), "text/javascript"],
  "/bench-worker.js": [path.join(import.meta.dirname, "browser/bench-worker.js"), "text/javascript"],
  "/js/engine/engine-wasm.js": [path.join(ROOT, "js/engine/engine-wasm.js"), "text/javascript"],
  "/engine.wasm": [path.join(ROOT, "engine/target/wasm32-unknown-unknown/release/autostacc_engine.wasm"), "application/wasm"]
};
const server = http.createServer((req, res) => {
  const f = files[new URL(req.url, "http://x").pathname];
  if (!f) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "Content-Type": f[1] }).end(fs.readFileSync(f[0]));
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const results = [];
for (const workers of [1, 2, 4]) {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/?workers=${workers}`);
  await page.setInputFiles("#pack", pack);
  await page.waitForFunction(() => window.benchResult, null, { timeout: 600_000 });
  results.push(await page.evaluate(() => window.benchResult));
  await page.close();
}
await browser.close();
server.close();
const mb = fs.statSync(pack).size / 1048576;
const rate = (s) => +(mb / s).toFixed(0);
const one = results[0].one;
console.log(JSON.stringify({
  pack: path.basename(pack), zipMb: +mb.toFixed(1), browser: "chromium (headless)", initMs: +one.initMs.toFixed(1),
  oneWorker: { listSeconds: +one.list.toFixed(3), inspectSeconds: +one.inspect.toFixed(2), inspectMbPerSecond: rate(one.inspect),
    inspectHandOverSeconds: +one["inspect-emit"].toFixed(2), handOverMbPerSecond: rate(one["inspect-emit"]) },
  parallel: results.map((r) => ({ workers: r.parallel.workers, seconds: +r.parallel.seconds.toFixed(2), mbPerSecond: rate(r.parallel.seconds), files: r.parallel.files }))
}, null, 2));

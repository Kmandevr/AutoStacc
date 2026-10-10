// Times the engine on a pack ZIP (docs/engine.md): the native binary (as the server Container runs it) and the
// WebAssembly build in Node, listing, inspecting (hash + format + facts for every file) and inspecting with every original
// handed to a sink (what the Pack Builder does before uploading). Browser timings: test/bench/browser-bench.js.
// Usage: node test/bench/engine-bench.js <pack.zip>   (build first: cargo build --release in engine/ and the wasm target)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const __dirname = import.meta.dirname;
const Engine = createRequire(import.meta.url)("../../js/engine/engine-wasm.js");

const ROOT = path.join(__dirname, "..", "..");
const pack = process.argv[2];
if (!pack) { console.error("usage: node test/bench/engine-bench.js <pack.zip>"); process.exit(64); }
const native = path.join(ROOT, "engine/target/release/autostacc-engine");
const wasmFile = path.join(ROOT, "engine/target/wasm32-unknown-unknown/release/autostacc_engine.wasm");
const mb = fs.statSync(pack).size / 1048576;

const time = (fn) => { const t = process.hrtime.bigint(); const r = fn(); return [r, Number(process.hrtime.bigint() - t) / 1e9]; };
const rows = [];
const row = (what, seconds, extra = {}) => rows.push({ what, seconds: +seconds.toFixed(3), mbPerSecond: +(mb / seconds).toFixed(0), ...extra });

(async () => {
  const [listed, tList] = time(() => JSON.parse(execFileSync(native, ["list", pack], { maxBuffer: 1 << 30 })));
  row("native list", tList, { files: listed.files.length });
  const [inspected, tNative] = time(() => JSON.parse(execFileSync(native, ["inspect", pack], { maxBuffer: 1 << 30 })));
  row("native inspect", tNative);
  const outDir = path.join(__dirname, "out", "extract");
  fs.rmSync(outDir, { recursive: true, force: true });
  const [, tExtract] = time(() => execFileSync(native, ["inspect", pack, "--extract", outDir], { maxBuffer: 1 << 30 }));
  row("native inspect + write originals", tExtract);
  fs.rmSync(outDir, { recursive: true, force: true });

  const [engine, tInit] = await (async () => { const t = process.hrtime.bigint(); const e = await Engine.create(fs.readFileSync(wasmFile)); return [e, Number(process.hrtime.bigint() - t) / 1e9]; })();
  const fd = fs.openSync(pack, "r");
  const size = fs.fstatSync(fd).size;
  const src = engine.addSource({ size, read: (off, len) => { const b = Buffer.allocUnsafe(len); const n = fs.readSync(fd, b, 0, len, off); return b.subarray(0, n); } });
  const [wl, tWList] = time(() => engine.list(src));
  row("wasm list (Node)", tWList, { files: wl.files.length });
  const [wi, tWasm] = time(() => engine.inspect(src));
  row("wasm inspect (Node)", tWasm);
  let streamed = 0;
  const [, tSink] = time(() => engine.inspect(src, { chunk: (c) => { streamed += c.length; } }));
  row("wasm inspect + hand over originals (Node)", tSink, { streamedMb: +(streamed / 1048576).toFixed(1) });

  // The two builds must agree exactly (same engine, same contract).
  const strip = (r) => JSON.stringify(r.files.map((f) => [f.path, f.sha256, f.format, f.facts]));
  const agree = strip(inspected) === strip(wi);
  const refused = inspected.files.filter((f) => f.issues.some((i) => i.refused)).length;
  console.log(JSON.stringify({ pack: path.basename(pack), zipMb: +mb.toFixed(1), files: inspected.files.length, refused, wasmInitMs: +(tInit * 1000).toFixed(1),
    wasmBytes: fs.statSync(wasmFile).size, nativeAndWasmAgree: agree, cpu: os.cpus()[0].model, rows }, null, 2));
  if (!agree) process.exit(1);
})();

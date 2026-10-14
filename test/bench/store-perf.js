// The store's side of a big pack, timed (docs/packs.md §13, re-run in Phase 9): a local store (test/support/servers.js)
// with the real engine (engine/target/release/autostacc-engine serve, through the store's storage relay), and a pack of
// 2,000 files (the limit per version). Times the upload, processing and import, publishing, a buyer's library, a ZIP of
// all 2,000 files (first byte and whole) and the daily sweep; writes test/bench/out/store-perf.md.
// Needs `npm run -s site` first (dist/) and the release engine build. Usage: node test/bench/store-perf.js [files]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { startStores } from "../support/servers.js";
import { adminClient, newBuyer, mockBuy } from "../support/flows.js";

const require = createRequire(import.meta.url);
const S = require("../../scripts/lib/synth.js");
const ROOT = path.join(import.meta.dirname, "..", "..");
const OUT = path.join(import.meta.dirname, "out");
const N = Number(process.argv[2] || 2000);
const STORE = 8850, ENGINE = 8851;
const SWEEP_TOKEN = "sweep-token-for-perf-".padEnd(40, "x");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const timed = async (fn) => { const t = performance.now(); const v = await fn(); return [v, Math.round(performance.now() - t)]; };

// A plain stored ZIP of N short WAVs (different bytes each) in nested folders.
function pack(n) {
  const kick = S.kick();
  const parts = [], cd = [];
  let off = 0;
  for (let i = 0; i < n; i++) {
    const x = Float32Array.from(kick, (v, j) => v * (0.5 + ((i * 7919 + j) % 97) / 200));
    const data = S.wav16(x.subarray(0, 4000 + (i % 50) * 10));
    const name = Buffer.from(`Perf Kit/${["Kicks", "Snares", "Hats", "Toms"][i % 4]}/Set ${Math.floor(i / 100)}/Hit ${String(i).padStart(4, "0")}.wav`);
    const crc = zlib.crc32(data) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, data); cd.push(ch, name);
    off += 30 + name.length + data.length;
  }
  const cdb = Buffer.concat(cd), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(n, 8); end.writeUInt16LE(n, 10); end.writeUInt32LE(cdb.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdb, end]);
}

const zip = pack(N);
const engine = spawn(path.join(ROOT, "engine/target/release/autostacc-engine"), ["serve", `127.0.0.1:${ENGINE}`], {
  env: { ...process.env, R2_ENDPOINT: `http://localhost:${STORE}/api/internal/engine-storage`, R2_BUCKETS: "autostacc-files" }, stdio: "ignore"
});
const stores = await startStores({ name: "perf", ports: { mock: STORE }, stripe: false, vars: { ENGINE_URL: `http://127.0.0.1:${ENGINE}`, SWEEP_TOKEN } });
const base = stores.mock.url;
const rows = [];
const row = (what, ms, note = "") => { rows.push(`| ${what} | ${ms} ms | ${note} |`); console.log(what, ms, "ms", note); };
try {
  const admin = await adminClient(base);
  const [created, tCreate] = await timed(() => admin.post("/api/admin/packs/frayed-signals-samples/versions", { productId: "sample-pack-vol1", filename: "perf.zip", size: zip.length, idempotencyKey: crypto.randomUUID() }));
  if (created.status !== 201) throw new Error(JSON.stringify(created.data));
  row("Create a version", tCreate);
  const { version, upload } = created.data;
  const P = "/api/admin/packs";
  const parts = Math.ceil(zip.length / upload.partBytes);
  const [, tUp] = await timed(async () => {
    for (let n = 1; n <= parts; n++) {
      const part = zip.subarray((n - 1) * upload.partBytes, n * upload.partBytes);
      const r = await admin.send("PUT", `${P}/uploads/${upload.uploadId}/parts/${n}`, { raw: part, headers: { "Content-Type": "application/octet-stream" } });
      if (r.status !== 200) throw new Error(JSON.stringify(r.data));
    }
    return admin.post(`${P}/uploads/${upload.uploadId}/complete`, {});
  });
  row(`Upload ${(zip.length / 1048576).toFixed(0)} MB (${parts} part${parts > 1 ? "s" : ""})`, tUp, "local, so this is the store's own cost");
  const [v, tProc] = await timed(async () => {
    let x;
    for (let i = 0; i < 1200; i++) {
      x = (await admin.get(`${P}/versions/${version.id}`)).data.version;
      if (x.status !== "processing") return x;
      await wait(250);
    }
    return x;
  });
  if (v.status !== "ready") throw new Error(`version ${v.status} ${v.note || ""}`);
  row(`Check ${N} files and import the answer`, tProc, "engine (with analysis) plus the import's batch");
  const [, tView] = await timed(() => admin.get(`${P}/versions/${version.id}`));
  row("Load the version for review", tView, `${v.files.length} files`);
  const [pub, tPub] = await timed(() => admin.post(`${P}/versions/${version.id}/publish`, {}));
  if (pub.status !== 200) throw new Error(JSON.stringify(pub.data));
  row("Publish", tPub, "one batch, then the product's contents");
  const { c } = await newBuyer(base, "perf-buyer");
  await mockBuy(c, [{ productId: "sample-pack-vol1" }]);
  const [lib, tLib] = await timed(() => c.get("/api/library"));
  const files = lib.data.items.find((p) => p.productId === "sample-pack-vol1").files.filter((f) => f.folderPath !== undefined && f.filename.startsWith("Hit "));
  row("A buyer's library", tLib, `${files.length} pack files`);
  const [made, tMade] = await timed(() => c.post("/api/downloads/bundle", { fileIds: files.map((f) => f.id) }));
  if (made.status !== 200) throw new Error(JSON.stringify(made.data));
  row(`Make a ZIP link for ${files.length} files`, tMade);
  const t0 = performance.now();
  const res = await fetch(base + made.data.url, { headers: { Cookie: c.cookieHeader(), "cf-connecting-ip": c.ip } });
  const reader = res.body.getReader();
  let first = null, bytes = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; first ??= Math.round(performance.now() - t0); bytes += value.length; }
  row("ZIP: first byte", first);
  row("ZIP: whole", Math.round(performance.now() - t0), `${(bytes / 1048576).toFixed(0)} MB`);
  const [, tSweep] = await timed(() => fetch(`${base}/api/internal/sweep`, { method: "POST", headers: { Authorization: `Bearer ${SWEEP_TOKEN}` } }).then((r) => r.json()));
  row("Daily sweep", tSweep);
  const [, tSearch] = await timed(() => fetch(`${base}/api/store/search?q=kit`).then((r) => r.json()));
  row("Store search", tSearch, "(the 3,000-product timing is in the discovery API suite)");
} finally {
  await stores.stop();
  engine.kill();
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "store-perf.md"), `# The store with a ${N}-file pack (local, ${new Date().toISOString().slice(0, 10)})\n\n| Step | Time | Note |\n| --- | --- | --- |\n${rows.join("\n")}\n`);
process.exit(0);

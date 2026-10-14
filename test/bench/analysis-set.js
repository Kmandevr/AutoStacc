// The engine's analysis against a labelled set (docs/engine.md, "Analysis"; docs/packs.md Phase 8): a few hundred
// synthetic files with a known tempo and key (scripts/lib/synth.js) — drum loops in four patterns, swing and noise;
// chord loops in all 24 keys, with and without drums; pads with a key and no pulse; one-shots and noise with neither —
// put in one ZIP, inspected by the native engine with --analyze, and scored: how often each estimate is right, how
// often it says something when it shouldn't, and how precise it is above each confidence. Synthetic material only: a
// floor for the engine, not a measure of real music. Usage: node test/bench/analysis-set.js [engine binary]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const S = require("../../scripts/lib/synth.js");
const ROOT = path.join(import.meta.dirname, "..", "..");
const bin = process.argv[2] || path.join(ROOT, "engine/target/release/autostacc-engine");
const OUT = path.join(import.meta.dirname, "out");
fs.mkdirSync(OUT, { recursive: true });

const NAMES = ["c", "cs", "d", "ds", "e", "f", "fs", "g", "gs", "a", "as", "b"];
const items = [];
const add = (samples, label) => items.push({ name: `set/${String(items.length).padStart(4, "0")}.wav`, data: S.wav16(samples), label });
let seed = 1;
for (const bpm of [70, 80, 90, 100, 110, 120, 128, 140, 150, 160, 174]) {
  for (const pattern of ["four", "break", "half"]) {
    for (const [swing, noise] of [[0, 0], [0.3, 0], [0, 0.05]]) {
      add(S.drumLoop({ bpm, bars: bpm > 130 ? 4 : 2, pattern, swing, noise, seed: seed++ }), { kind: `drums-${pattern}`, bpm, key: null });
    }
  }
}
for (let tonic = 0; tonic < 12; tonic++) {
  for (const minor of [false, true]) {
    const bpm = [90, 120, 140][(tonic + (minor ? 1 : 0)) % 3];
    add(S.chordLoop({ bpm, tonic: 48 + tonic, minor, bars: 4 }), { kind: "chords", bpm, key: `${NAMES[tonic]}-${minor ? "minor" : "major"}` });
    add(S.chordLoop({ bpm, tonic: 48 + tonic, minor, bars: 4, drums: true, seed: seed++ }), { kind: "chords+drums", bpm, key: `${NAMES[tonic]}-${minor ? "minor" : "major"}` });
  }
  const triad = S.progression(48 + tonic, false)[0];
  add(S.pad(triad.map((m) => m + 12), 6), { kind: "pad", bpm: null, key: `${NAMES[tonic]}-major` });
}
for (let i = 0; i < 12; i++) add(S.kick(), { kind: "one-shot", bpm: null, key: null });
for (let i = 0; i < 12; i++) add(S.noise(4, S.SR, 100 + i), { kind: "noise", bpm: null, key: null });

// A plain stored ZIP of them.
function zip(entries) {
  const parts = [], cd = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name), crc = zlib.crc32(e.data) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(e.data.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(e.data.length, 20); ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, e.data); cd.push(ch, name);
    off += 30 + name.length + e.data.length;
  }
  const cdb = Buffer.concat(cd), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cdb.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdb, end]);
}
const file = path.join(OUT, "analysis-set.zip");
fs.writeFileSync(file, zip(items));
const started = Date.now();
const result = JSON.parse(execFileSync(bin, ["inspect", file, "--analyze"], { maxBuffer: 1 << 28 }));
const ms = Date.now() - started;
const byName = new Map(result.files.map((f) => [f.path, f.analysis || {}]));

const rows = items.map((it) => ({ ...it.label, got: byName.get(it.name) }));
const tempoOk = (r) => r.got.bpm && Math.abs(Number(r.got.bpm.value) - r.bpm) <= 1;
const octave = (r) => r.got.bpm && [0.5, 2].some((m) => Math.abs(Number(r.got.bpm.value) - r.bpm * m) <= 1);
const relative = (got, want) => {
  const [t, q] = want.split("-"), i = NAMES.indexOf(t);
  const rel = q === "minor" ? `${NAMES[(i + 3) % 12]}-major` : `${NAMES[(i + 9) % 12]}-minor`;
  return got === rel;
};

const lines = [];
const say = (s = "") => { lines.push(s); console.log(s); };
say(`# Analysis on the labelled set (${items.length} files, ${(fs.statSync(file).size / 1048576).toFixed(0)} MB, ${ms} ms in all, ${(ms / items.length).toFixed(1)} ms a file)`);
say();
say("| Material | Files | Tempo right | Octave off | Tempo where none | Key right | Relative key | Key where none |");
say("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const kind of [...new Set(rows.map((r) => r.kind))]) {
  const g = rows.filter((r) => r.kind === kind);
  const withT = g.filter((r) => r.bpm), withK = g.filter((r) => r.key), noT = g.filter((r) => !r.bpm), noK = g.filter((r) => !r.key);
  const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "–");
  say(`| ${kind} | ${g.length} | ${pct(withT.filter(tempoOk).length, withT.length)} | ${pct(withT.filter(octave).length, withT.length)} | ${pct(noT.filter((r) => r.got.bpm).length, noT.length)} | ${pct(withK.filter((r) => r.got.key && r.got.key.value === r.key).length, withK.length)} | ${pct(withK.filter((r) => r.got.key && relative(r.got.key.value, r.key)).length, withK.length)} | ${pct(noK.filter((r) => r.got.key).length, noK.length)} |`);
}
say();
say("Precision above each confidence (of the estimates made at or above it, how many are right; and how many of all files get one):");
say();
say("| Confidence ≥ | Tempo precision | Tempo given | Key precision | Key given |");
say("| --- | --- | --- | --- | --- |");
for (const c of [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95]) {
  const t = rows.filter((r) => r.got.bpm && r.got.bpm.confidence >= c), k = rows.filter((r) => r.got.key && r.got.key.confidence >= c);
  const tp = t.filter((r) => r.bpm && tempoOk(r)).length, kp = k.filter((r) => r.key && r.got.key.value === r.key).length;
  const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "–");
  say(`| ${c} | ${pct(tp, t.length)} | ${t.length} | ${pct(kp, k.length)} | ${k.length} |`);
}
fs.writeFileSync(path.join(OUT, "analysis-report.md"), lines.join("\n") + "\n");
if (process.env.SHOW) for (const r of rows) {
  const t = r.got.bpm, k = r.got.key;
  const badT = r.bpm ? !tempoOk(r) : Boolean(t), badK = r.key ? !(k && k.value === r.key) : Boolean(k);
  if ((process.env.SHOW === "tempo" && badT) || (process.env.SHOW === "key" && badK)) console.log(r.kind, r.bpm, r.key, "→", t && `${t.value} (${t.confidence})`, k && `${k.value} (${k.confidence})`);
}

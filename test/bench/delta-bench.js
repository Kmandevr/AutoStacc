// Measures whether storing a revised file as a delta of its earlier version would save space (docs/packs.md, Phase 6;
// owner: "deltas inside a file only if measurements show real savings"). Makes 24-bit stereo WAVs like a sample pack's
// (tonal content plus noise), applies the edits creators make between versions, and reports how much of the new file a
// delta store could reuse from the old one: fixed 64 KiB blocks (what a simple block store dedups), and content-defined
// chunks (gear hash, ~16 KiB average, the best case for shifted bytes). Usage: node test/bench/delta-bench.js
import crypto from "node:crypto";

let seed = 777;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);

// A WAV: RIFF header, an optional LIST/INFO tag, 24-bit stereo samples.
function wav(samples, tag = "") {
  const info = tag ? Buffer.concat([Buffer.from("LIST"), u32(4 + 8 + even(tag).length), Buffer.from("INFOICMT"), u32(even(tag).length), even(tag)]) : Buffer.alloc(0);
  const fmt = Buffer.concat([Buffer.from("fmt "), u32(16), u16(1), u16(2), u32(44100), u32(44100 * 6), u16(6), u16(24)]);
  const data = Buffer.concat([Buffer.from("data"), u32(samples.length), samples]);
  return Buffer.concat([Buffer.from("RIFF"), u32(4 + fmt.length + info.length + data.length), Buffer.from("WAVE"), fmt, info, data]);
}
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const even = (s) => { const b = Buffer.from(s + "\0"); return b.length % 2 ? Buffer.concat([b, Buffer.alloc(1)]) : b; };

function audio(seconds, freq) {
  const frames = Math.round(seconds * 44100);
  const out = Buffer.alloc(frames * 6);
  for (let i = 0; i < frames; i++) {
    const v = Math.sin((2 * Math.PI * freq * i) / 44100) * 0.4 + Math.sin((2 * Math.PI * freq * 2.01 * i) / 44100) * 0.2 + (rand() - 0.5) * 0.05;
    for (let c = 0; c < 2; c++) out.writeIntLE(Math.round(Math.max(-1, Math.min(1, v)) * 8388607), i * 6 + c * 3, 3);
  }
  return out;
}
// Sample-level edits.
const gain = (s, db) => { const out = Buffer.from(s); const g = 10 ** (db / 20); for (let i = 0; i < out.length; i += 3) out.writeIntLE(Math.max(-8388608, Math.min(8388607, Math.round(out.readIntLE(i, 3) * g))), i, 3); return out; };
const fade = (s, frames) => { const out = Buffer.from(s); for (let f = 0; f < frames; f++) for (let c = 0; c < 2; c++) { const i = (out.length / 6 - frames + f) * 6 + c * 3; out.writeIntLE(Math.round(out.readIntLE(i, 3) * (1 - f / frames)), i, 3); } return out; };

function fixedChunks(buf, size = 65536) {
  const out = [];
  for (let i = 0; i < buf.length; i += size) out.push(buf.subarray(i, i + size));
  return out;
}
// Content-defined chunks: a gear rolling hash cuts where its low bits are zero (average ~16 KiB, 4 KiB to 64 KiB).
const GEAR = Array.from({ length: 256 }, (_, i) => crypto.createHash("sha256").update(String(i)).digest().readUInt32LE(0));
function cdcChunks(buf, mask = (1 << 14) - 1, min = 4096, max = 65536) {
  const out = [];
  let start = 0, h = 0;
  for (let i = 0; i < buf.length; i++) {
    h = ((h << 1) + GEAR[buf[i]]) >>> 0;
    const len = i - start + 1;
    if ((len >= min && (h & mask) === 0) || len >= max) { out.push(buf.subarray(start, i + 1)); start = i + 1; h = 0; }
  }
  if (start < buf.length) out.push(buf.subarray(start));
  return out;
}
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
function reused(before, after, chunker) {
  const have = new Set(chunker(before).map(sha));
  const chunks = chunker(after);
  return chunks.filter((c) => have.has(sha(c))).reduce((n, c) => n + c.length, 0) / after.length;
}

const base = audio(8, 110);
const v1 = wav(base, "Loop 120 Am");
const edits = {
  "same audio, new tag text": wav(base, "Loop 120 Am, from Glitch Kit v2"),
  "tag added to an untagged file": wav(base, "Loop 120 Am, from Glitch Kit v2 (extended credits)"),
  "trimmed 10 ms at the start": wav(base.subarray(441 * 6), "Loop 120 Am"),
  "fade-out on the last 0.5 s": wav(fade(base, 22050), "Loop 120 Am"),
  "half a second added at the end": wav(Buffer.concat([base, audio(0.5, 110)]), "Loop 120 Am"),
  "gain -1 dB (every sample changes)": wav(gain(base, -1), "Loop 120 Am"),
  "re-rendered (new noise, same sound)": wav(audio(8, 110), "Loop 120 Am")
};
console.log(`file: 8 s, 24-bit stereo WAV, ${(v1.length / 1048576).toFixed(2)} MB`);
console.log("edit".padEnd(40), "64 KiB blocks", " content-defined");
for (const [name, after] of Object.entries(edits)) {
  const before = name === "tag added to an untagged file" ? wav(base) : v1;
  const p = (x) => `${(x * 100).toFixed(1)}%`.padStart(13);
  console.log(name.padEnd(40), p(reused(before, after, fixedChunks)), p(reused(before, after, cdcChunks)) + "  reusable");
}

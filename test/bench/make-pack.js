// Writes a synthetic sample pack ZIP for engine benchmarks (docs/engine.md): 24-bit stereo WAV one-shots and loops
// with tonal content plus noise (so deflate behaves like on real audio), MIDI patterns, and a readme, in nested folders.
// Usage: node test/bench/make-pack.js [--mb 1024] [--store] [--out test/bench/out/pack.zip]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const __dirname = import.meta.dirname;

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const targetMb = Number(arg("--mb", "1024"));
const store = process.argv.includes("--store");
const out = arg("--out", path.join(__dirname, "out", `pack-${targetMb}mb${store ? "-store" : ""}.zip`));
if (targetMb > 3800) { console.error("This generator writes plain ZIP (not ZIP64): keep it under 3800 MB."); process.exit(1); }
fs.mkdirSync(path.dirname(out), { recursive: true });

let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);

function wav(seconds, freq, bpm) {
  const sr = 44100, ch = 2, frames = Math.round(seconds * sr);
  const data = Buffer.alloc(frames * ch * 3);
  let o = 0;
  for (let i = 0; i < frames; i++) {
    const env = Math.exp(-i / (sr * (bpm ? 2 : 0.25)));
    const tone = Math.sin((2 * Math.PI * freq * i) / sr) * 0.5 + Math.sin((2 * Math.PI * freq * 2.01 * i) / sr) * 0.2;
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, tone * env + (rand() - 0.5) * 0.02));
      data.writeIntLE(Math.round(v * 8388607), o, 3);
      o += 3;
    }
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(ch, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * ch * 3, 28); h.writeUInt16LE(ch * 3, 32); h.writeUInt16LE(24, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function midi(bars) {
  const ev = [0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20];
  for (let i = 0; i < bars * 4; i++) ev.push(0x00, 0x90, 48 + (i % 12), 100, 0x60, 0x80, 48 + (i % 12), 0);
  ev.push(0x00, 0xff, 0x2f, 0x00);
  const trk = Buffer.from(ev);
  return Buffer.concat([Buffer.from("MThd\0\0\0\x06\0\0\0\x01\0\x60MTrk", "latin1"), Buffer.from([0, 0, trk.length >> 8, trk.length & 255]), trk]);
}

const fd = fs.openSync(out, "w");
let offset = 0;
const central = [];
function add(name, data) {
  const crc = zlib.crc32(data);
  const body = store ? data : zlib.deflateRawSync(data, { level: 6 });
  const method = store ? 0 : 8;
  const n = Buffer.from(name, "utf8");
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(method, 8);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
  fs.writeSync(fd, lh); fs.writeSync(fd, n); fs.writeSync(fd, body);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(method, 10);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28);
  ch.writeUInt32LE(offset, 42);
  central.push(ch, n);
  offset += 30 + n.length + body.length;
}

const notes = ["C", "D", "E", "F", "G", "A", "B"];
let files = 0, raw = 0;
const started = Date.now();
while (raw < targetMb * 1048576) {
  const k = files++;
  const note = notes[k % 7];
  let name, data;
  if (k % 10 < 5) { name = `Pack/Drums/${["Kicks", "Snares", "Hats", "Percs"][k % 4]}/Hit ${k}.wav`; data = wav(0.3 + rand() * 1.2, 40 + rand() * 200, 0); }
  else if (k % 10 < 8) { name = `Pack/Loops/${120 + (k % 5) * 4} BPM/Loop ${k} ${note}min.wav`; data = wav(8 + rand() * 8, 110 + rand() * 300, 120); }
  else if (k % 10 < 9) { name = `Pack/MIDI/Pattern ${k} ${note}min.mid`; data = midi(4); }
  else { name = `Pack/Synths/Pad ${k}.wav`; data = wav(4, 220 + rand() * 220, 0); }
  add(name, data);
  raw += data.length;
}
add("Pack/Documentation/readme.txt", Buffer.from("Synthetic benchmark pack.\n"));
const cd = Buffer.concat(central);
fs.writeSync(fd, cd);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files + 1, 8); end.writeUInt16LE(files + 1, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.writeSync(fd, end);
fs.closeSync(fd);
console.log(JSON.stringify({ out, files: files + 1, rawMb: +(raw / 1048576).toFixed(1), zipMb: +(fs.statSync(out).size / 1048576).toFixed(1), seconds: (Date.now() - started) / 1000 }));

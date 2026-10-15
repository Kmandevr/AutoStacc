// Writes the engine's conformance cases (engine/conformance/cases/*.zip): small, deterministic archives covering a normal
// pack and every way an archive can be unsafe or broken. Plain Node, no dependencies. Rerun only when adding a case:
//   node scripts/engine-fixtures.js
// then refresh the expected answers with node scripts/engine-conformance.js --update (and review the diff).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const S = require("./lib/synth.js");

const OUT = path.join(__dirname, "..", "engine", "conformance", "cases");

// One ZIP from entries { name (string or Buffer), data, store?, utf8?, flags?, unixMode?, size?, crc?, lhoFrom? }.
function zip(entries) {
  const parts = [];
  const cd = [];
  const offsets = [];
  let off = 0;
  entries.forEach((e, i) => {
    const name = Buffer.isBuffer(e.name) ? e.name : Buffer.from(e.name, "utf8");
    const data = Buffer.from(e.data || "");
    const body = e.store ? data : zlib.deflateRawSync(data, { level: 6 });
    const method = e.store ? 0 : 8;
    const flags = (e.flags || 0) | (e.utf8 === false ? 0 : 0x800);
    const crc = e.crc !== undefined ? e.crc : zlib.crc32(data);
    const size = e.size !== undefined ? e.size : data.length;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc >>> 0, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(size, 22); lh.writeUInt16LE(name.length, 26);
    offsets.push(off);
    parts.push(lh, name, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(e.unixMode ? 0x0314 : 20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc >>> 0, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(size, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(((e.unixMode || 0) << 16) >>> 0, 38);
    ch.writeUInt32LE(e.lhoFrom !== undefined ? offsets[e.lhoFrom] : off, 42);
    cd.push(ch, name);
    off += 30 + name.length + body.length;
  });
  const cdBuf = Buffer.concat(cd);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}

function wav({ sr = 44100, ch = 2, bits = 24, frames = 4410, acid = null, seed = 1 }) {
  const align = (ch * bits) / 8;
  const data = Buffer.alloc(frames * align);
  let x = seed;
  for (let i = 0; i < data.length; i++) { x = (x * 1103515245 + 12345) >>> 0; data[i] = (x >>> 16) & 0xff; }
  const chunks = [];
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(1, 8); fmt.writeUInt16LE(ch, 10); fmt.writeUInt32LE(sr, 12);
  fmt.writeUInt32LE(sr * align, 16); fmt.writeUInt16LE(align, 20); fmt.writeUInt16LE(bits, 22);
  chunks.push(fmt);
  if (acid) {
    const a = Buffer.alloc(32);
    a.write("acid", 0); a.writeUInt32LE(24, 4); a.writeUInt32LE(acid.oneShot ? 1 : 0, 8); a.writeUInt16LE(60, 12);
    a.writeUInt32LE(8, 20); a.writeUInt16LE(4, 24); a.writeUInt16LE(4, 26); a.writeFloatLE(acid.bpm || 0, 28);
    chunks.push(a);
  }
  const dh = Buffer.alloc(8);
  dh.write("data", 0); dh.writeUInt32LE(data.length, 4);
  chunks.push(dh, data);
  const body = Buffer.concat(chunks);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0); riff.writeUInt32LE(4 + body.length, 4); riff.write("WAVE", 8);
  return Buffer.concat([riff, body]);
}

function aiff({ zeroRate = false } = {}) {
  const comm = Buffer.alloc(26);
  comm.write("COMM", 0); comm.writeUInt32BE(18, 4); comm.writeUInt16BE(1, 8); comm.writeUInt32BE(22050, 10); comm.writeUInt16BE(16, 14);
  if (!zeroRate) Buffer.from([0x40, 0x0e, 0xac, 0x44, 0, 0, 0, 0, 0, 0]).copy(comm, 16);
  const ssnd = Buffer.alloc(16 + 44100);
  ssnd.write("SSND", 0); ssnd.writeUInt32BE(8 + 44100, 4);
  const body = Buffer.concat([comm, ssnd]);
  const head = Buffer.alloc(12);
  head.write("FORM", 0); head.writeUInt32BE(4 + body.length, 4); head.write("AIFF", 8);
  return Buffer.concat([head, body]);
}

function flac() {
  const b = Buffer.alloc(8 + 34);
  b.write("fLaC", 0); b[4] = 0x80; b[7] = 34;
  // STREAMINFO: sample rate 48000 (20 bits), channels-1 = 1, bits-1 = 23, total samples 96000 (36 bits)
  const x = (48000n << 44n) | (1n << 41n) | (23n << 36n) | 96000n;
  b.writeBigUInt64BE(x, 8 + 10);
  return b;
}

function midi() {
  const ev = [0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, 0x00, 0xff, 0x58, 0x04, 4, 2, 24, 8, 0x00, 0xff, 0x59, 0x02, 0xff, 1];
  for (let i = 0; i < 8; i++) ev.push(0x00, 0x90, 57 + (i % 5), 100, 0x83, 0x00, 0x80, 57 + (i % 5), 0);
  ev.push(0x00, 0xff, 0x2f, 0x00);
  const trk = Buffer.from(ev);
  return Buffer.concat([Buffer.from("MThd\0\0\0\x06\0\0\0\x01\0\x60MTrk", "latin1"), Buffer.from([0, 0, trk.length >> 8, trk.length & 255]), trk]);
}

const CASES = {
  // A small, normal pack: folders, several formats, one-shot and loop claims, a readme, macOS clutter to ignore.
  "pack-basic": () => zip([
    { name: "Pack/Drums/Kicks/Kick 01.wav", data: wav({ frames: 13230, acid: { oneShot: true }, seed: 2 }) },
    { name: "Pack/Loops/128 BPM/Groove 128 Am.wav", data: wav({ sr: 48000, frames: 180000, acid: { bpm: 128 }, seed: 3 }) },
    { name: "Pack/Textures/Air.aif", data: aiff() },
    { name: "Pack/Textures/Room.flac", data: flac() },
    { name: "Pack/MIDI/Chords Am.mid", data: midi() },
    { name: "Pack/Presets/Wobble.vital", data: '{"preset_name":"Wobble"}' },
    { name: "Pack/Read me.txt", data: "Thanks for downloading.\n", store: true },
    { name: "__MACOSX/Pack/._Read me.txt", data: "x", store: true },
    { name: "Pack/.DS_Store", data: "x", store: true }
  ]),
  // The next version of pack-basic, for revisions: the same kick, groove, room, chords; Air moved to another folder;
  // the read-me replaced; the preset removed; a changelog added.
  "pack-revision": () => zip([
    { name: "Pack/Drums/Kicks/Kick 01.wav", data: wav({ frames: 13230, acid: { oneShot: true }, seed: 2 }) },
    { name: "Pack/Loops/128 BPM/Groove 128 Am.wav", data: wav({ sr: 48000, frames: 180000, acid: { bpm: 128 }, seed: 3 }) },
    { name: "Pack/Ambience/Air.aif", data: aiff() },
    { name: "Pack/Textures/Room.flac", data: flac() },
    { name: "Pack/MIDI/Chords Am.mid", data: midi() },
    { name: "Pack/Read me.txt", data: "Thanks for downloading version 2.\n", store: true },
    { name: "Pack/Changelog.txt", data: "Version 2: Air moved to Ambience, Wobble removed.\n", store: true }
  ]),
  // Real sounds for the analysis check (engine --analyze): names that say nothing about tempo or key, so only
  // listening can tell. A 120 BPM drum break, a 100 BPM A minor chord loop, a one-shot and noise (scripts/lib/synth.js).
  "analysis": () => zip([
    { name: "Sounds/Loop A.wav", data: S.wav16(S.drumLoop({ bpm: 120, bars: 2, pattern: "break", seed: 11 })) },
    { name: "Sounds/Loop B.wav", data: S.wav16(S.chordLoop({ bpm: 100, tonic: 57, minor: true, bars: 4 })) },
    { name: "Sounds/Hit.wav", data: S.wav16(S.kick()) },
    { name: "Sounds/Air.wav", data: S.wav16(S.noise(3)) },
    // Kept, with a warning for the automated review: two seconds of nothing, and a WAV in a codec nothing decodes.
    { name: "Sounds/Silence.wav", data: S.wav16(new Float32Array(S.SR * 2)) },
    { name: "Sounds/Odd codec.wav", data: (() => { const b = S.wav16(S.kick()); b.writeUInt16LE(0x7777, 20); return b; })() },
    // Crafted headers that once crashed the decoder (a sample rate of 0): warned about, never a crashed job.
    { name: "Sounds/Zero rate.wav", data: (() => { const b = S.wav16(S.kick()); b.writeUInt32LE(0, 24); b.writeUInt32LE(0, 28); return b; })() },
    { name: "Sounds/Zero rate.aif", data: aiff({ zeroRate: true }) },
    // Text that deflates well (for ZIP downloads' deflate variants, server/downloads/variants.js).
    { name: "Notes.txt", data: Array.from({ length: 120 }, (_, i) => `Loop ${i % 4 ? "B" : "A"}: tempo and key from listening, not from the name.\n`).join("") },
    // Ogg with a codec analysis can't decode (Opus): kept, not heard, and not called broken.
    { name: "Sounds/Voice.ogg", data: (() => {
      const head = Buffer.from("OpusHead\x01\x01\x38\x01\x80\xbb\x00\x00\x00\x00\x00", "latin1");
      const page = Buffer.alloc(27);
      page.write("OggS", 0); page[5] = 2; page.writeUInt32LE(1, 14); page[26] = 1;
      return Buffer.concat([page, Buffer.from([head.length]), head]);
    })() }
  ]),
  // How creators name things, for suggestions: kinds, instruments, tempos and keys in folder and file names, a tempo
  // that fits the length and one that doesn't, a name and a header that disagree, MIDI patterns and arrangements.
  // Files added to a version one step at a time (the Pac editor, server/packs/append.js): a new file, one in a folder
  // of its own, and a read me whose name the pack already has (refused as a duplicate where it lands).
  "addition": () => zip([
    { name: "Snare 02.wav", data: wav({ frames: 9000, seed: 21 }) },
    { name: "Fills/Fill 01.wav", data: wav({ frames: 30000, seed: 22 }) },
    { name: "Read me.txt", data: "Added later.\n", store: true }
  ]),
  "pack-names": () => zip([
    { name: "Glitch Kit/One Shots/Hi Hats/HH Closed 03.wav", data: wav({ frames: 4410, seed: 4 }) },
    { name: "Glitch Kit/One Shots/808s/808 Sub C.wav", data: wav({ frames: 44100, seed: 5 }) },
    { name: "Glitch Kit/Loops/Bass/Bassline_140bpm_F#min.wav", data: wav({ frames: 151200, seed: 6 }) },
    { name: "Glitch Kit/Loops/Drums/Break 174 BPM.wav", data: wav({ frames: 50000, seed: 7 }) },
    { name: "Glitch Kit/Loops/Vox/VoxChop 128 Gm.wav", data: wav({ frames: 82688, acid: { oneShot: true }, seed: 8 }) },
    { name: "Glitch Kit/MIDI/Patterns/Arp Pattern Dbmaj.mid", data: midi() },
    { name: "Glitch Kit/Stems/Track 1/Lead Stem.wav", data: wav({ frames: 88200, seed: 9 }) },
    { name: "Glitch Kit/Presets/Serum/LD Glitch Lead.fxp", data: "CcnK" + "\0".repeat(60) },
    { name: "Glitch Kit/Artwork/Cover.png", data: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex") },
    { name: "Glitch Kit/Licence.pdf", data: "%PDF-1.4\n%%EOF\n" }
  ]),
  // Unsafe names: traversal, absolute, Windows drive and reserved names; nothing here may be extracted.
  "unsafe-paths": () => zip([
    { name: "../escape.wav", data: wav({}) },
    { name: "/etc/passwd", data: "x" },
    { name: "C:\\Windows\\evil.txt", data: "x" },
    { name: "Pack/CON.txt", data: "x" },
    { name: "Pack/ok.txt", data: "fine", store: true }
  ]),
  // A symlink and a password-protected entry are refused.
  "symlink-and-encrypted": () => zip([
    { name: "link", data: "/etc/passwd", store: true, unixMode: 0o120777 },
    { name: "secret.wav", data: "x", flags: 1 }
  ]),
  // A decompression bomb: 64 MB of zeros, and an entry whose header claims less than it inflates to.
  "bombs": () => zip([
    { name: "zeros.wav", data: Buffer.alloc(64 << 20) },
    { name: "liar.wav", data: Buffer.alloc(200000, 7), size: 1000 }
  ]),
  // Bytes that don't match the name, and a CRC that doesn't match the bytes.
  "deceptive-and-damaged": () => zip([
    { name: "Not audio.wav", data: "plain text pretending to be audio" },
    { name: "Bad crc.txt", data: "original bytes", store: true, crc: 0x12345678 }
  ]),
  // Two names that land on the same file on Windows and macOS; a name in code page 437 (no UTF-8 flag).
  "names": () => zip([
    { name: "Loops/Kick.wav", data: wav({ seed: 5 }) },
    { name: "loops/kick.WAV", data: wav({ seed: 6 }) },
    { name: Buffer.from("Caf\x82.txt", "latin1"), data: "cp437", utf8: false, store: true }
  ]),
  // A second directory entry pointing at the first file's data (overlapping entries multiply small archives).
  "overlap": () => zip([
    { name: "a.txt", data: "aaaa", store: true },
    { name: "b.txt", data: "bbbb", store: true, lhoFrom: 0 }
  ]),
  // Not an archive at all.
  "not-a-zip": () => Buffer.from("This is a text file with a .zip name.\n")
};

// Archives the Pack Builder makes in the browser (js/zip-thin.js), so tests can follow it end to end: pack-revision as
// sent when the store already has pack-basic's files (only the read-me and changelog), and an archive with nothing
// left in it (a revision that only moves files).
const { thin } = require("../js/zip-thin.js");
const THIN = {
  "pack-revision-thin": async () => {
    const blob = new Blob([CASES["pack-revision"]()]);
    const { directory } = require("../js/zip-thin.js");
    const keep = (await directory(blob)).filter((e) => /^Pack\/(Read me|Changelog)\.txt$/.test(e.nameText));
    return Buffer.from(await (await thin(blob, keep)).arrayBuffer());
  },
  "empty": async () => Buffer.from(await (await thin(new Blob([CASES["pack-revision"]()]), [])).arrayBuffer())
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, make] of [...Object.entries(CASES), ...Object.entries(THIN)]) {
    const file = path.join(OUT, `${name}.zip`);
    fs.writeFileSync(file, await make());
    console.log(`${path.relative(process.cwd(), file)}  ${fs.statSync(file).size} bytes`);
  }
})();

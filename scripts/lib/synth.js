// Small, deterministic audio synthesis for engine test material (scripts/engine-fixtures.js, test/bench/analysis-set.js):
// drum loops and chord loops at a known tempo and key, one-shots and noise, written as 16-bit mono WAV. Not music, but
// what the engine's tempo and key analysis has to get right (and wrong on purpose). Plain Node, no dependencies.
const SR = 44100;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function wav16(samples, sr = SR) {
  const data = Buffer.alloc(samples.length * 2);
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.9 / peak : 0;
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * g)) * 32767), i * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(sr, 24); head.writeUInt32LE(sr * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

// Adds a sound into `out` at sample `at`.
const mix = (out, at, sound, gain = 1) => { for (let i = 0; i < sound.length && at + i < out.length; i++) if (at + i >= 0) out[at + i] += sound[i] * gain; };

function kick(sr = SR) {
  const n = Math.round(0.35 * sr);
  return Float32Array.from({ length: n }, (_, i) => { const t = i / sr; return Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-t * 40)) * t) * Math.exp(-t * 9); });
}
function snare(sr = SR, seed = 3) {
  const r = rng(seed), n = Math.round(0.2 * sr);
  return Float32Array.from({ length: n }, (_, i) => { const t = i / sr; return ((r() - 0.5) * 0.8 + 0.3 * Math.sin(2 * Math.PI * 190 * t)) * Math.exp(-t * 22); });
}
function hat(sr = SR, seed = 5) {
  const r = rng(seed), n = Math.round(0.05 * sr);
  return Float32Array.from({ length: n }, (_, i) => (r() - 0.5) * Math.exp(-(i / sr) * 80) * 0.5);
}

/** A drum loop: pattern "four" (kick every beat), "break" (kick 1 and the and of 2, snare 2 and 4), "half" (half-time). */
function drumLoop({ bpm, bars = 2, pattern = "break", swing = 0, sr = SR, seed = 1, noise = 0 }) {
  const beat = (60 / bpm) * sr;
  const out = new Float32Array(Math.round(beat * 4 * bars));
  const [k, s, h] = [kick(sr), snare(sr, seed + 2), hat(sr, seed + 4)];
  for (let b = 0; b < 4 * bars; b++) {
    const at = Math.round(b * beat), inBar = b % 4;
    if (pattern === "four" || (pattern === "break" && inBar === 0) || (pattern === "half" && inBar === 0)) mix(out, at, k);
    if (pattern === "break" && inBar === 1) mix(out, at + Math.round(beat / 2), k, 0.8);
    if ((pattern !== "half" && (inBar === 1 || inBar === 3)) || (pattern === "half" && inBar === 2)) mix(out, at, s, 0.8);
    mix(out, at, h, 0.6);
    mix(out, at + Math.round(beat / 2 + swing * beat / 6), h, 0.4);
  }
  if (noise) { const r = rng(seed + 9); for (let i = 0; i < out.length; i++) out[i] += (r() - 0.5) * noise; }
  return out;
}

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
// A plucked chord: harmonics that fade, so it's tonal with clear onsets.
function stab(notes, seconds, sr = SR) {
  const n = Math.round(seconds * sr);
  return Float32Array.from({ length: n }, (_, i) => {
    const t = i / sr;
    let v = 0;
    for (const m of notes) for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * hz(m) * h * t) / (h * h);
    return v * Math.exp(-t * 2.5) * 0.25;
  });
}

// Chords of a key: a minor key's i, VI, III, VII or a major key's I, V, vi, IV, from a tonic (MIDI note).
function progression(tonic, minor) {
  const triad = (root, q) => [root, root + (q === "m" ? 3 : 4), root + 7];
  return minor ? [triad(tonic, "m"), triad(tonic + 8, "M"), triad(tonic + 3, "M"), triad(tonic + 10, "M")]
    : [triad(tonic, "M"), triad(tonic + 7, "M"), triad(tonic + 9, "m"), triad(tonic + 5, "M")];
}

/** A chord loop: one chord per bar, struck on every beat, at `bpm`, in the key of `tonic` (MIDI note) major or minor. */
function chordLoop({ bpm, tonic = 57, minor = true, bars = 4, sr = SR, drums = false, seed = 1 }) {
  const beat = (60 / bpm) * sr;
  const out = new Float32Array(Math.round(beat * 4 * bars));
  const chords = progression(tonic, minor);
  for (let b = 0; b < 4 * bars; b++) mix(out, Math.round(b * beat), stab(chords[Math.floor(b / 4) % 4].map((m) => m - 12 * (b % 2 ? 0 : 1) + 12), 60 / bpm * 0.95, sr));
  if (drums) mix(out, 0, drumLoop({ bpm, bars, pattern: "break", sr, seed }), 0.5);
  return out;
}

function noise(seconds, sr = SR, seed = 7) {
  const r = rng(seed);
  return Float32Array.from({ length: Math.round(seconds * sr) }, () => r() - 0.5);
}

/** A long held chord with no pulse (a pad): tonal, no tempo. */
function pad(notes, seconds, sr = SR) {
  const n = Math.round(seconds * sr);
  return Float32Array.from({ length: n }, (_, i) => { const t = i / sr; return notes.reduce((v, m) => v + Math.sin(2 * Math.PI * hz(m) * t), 0) * 0.2; });
}

module.exports = { SR, wav16, kick, drumLoop, chordLoop, noise, pad, progression };

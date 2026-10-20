// The tiny waveform beside a name (owner, 2026-10-20: until profile pictures exist): 12 bars and a track colour drawn
// from the name, the same every time for that name, so people are easy to tell apart. Decorative (aria-hidden); the
// name is always written beside it. A deleted user gets a flat, grey line.
const BARS = 12;
const COLOURS = ["teal", "amber", "coral", "lime", "violet"];

// FNV-1a, so a name always gives the same shape.
function hash(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

export function wave(name) {
  if (!name) return '<svg class="cm-wave cm-wave-none" viewBox="0 0 24 16" aria-hidden="true"><rect x="0" y="7.5" width="24" height="1" rx=".5"/></svg>';
  let h = hash(name);
  const bars = [];
  for (let i = 0; i < BARS; i++) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    const height = 3 + (h % 12);
    bars.push(`<rect x="${i * 2}" y="${(16 - height) / 2}" width="1.4" height="${height}" rx=".7"/>`);
  }
  return `<svg class="cm-wave" data-wave="${COLOURS[hash(name + "#") % COLOURS.length]}" viewBox="0 0 24 16" aria-hidden="true">${bars.join("")}</svg>`;
}

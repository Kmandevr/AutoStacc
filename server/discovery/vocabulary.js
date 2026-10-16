// The store's controlled vocabulary: which structured fields (facets) a product may carry, the allowed values and their
// labels, which facets apply to which kind of product, synonyms that fold creators' words into one value, and the
// checks that turn input into clean metadata. The one source for the API (filters, search, Studio validation) and for
// the build (catalog products, and data/vocabulary.js for the browser). Pure: no imports, no I/O.

const v = (pairs) => Object.fromEntries(pairs.map((x) => (Array.isArray(x) ? x : [x.toLowerCase().replace(/[^a-z0-9]+/g, "-"), x])));

// Each facet: label, values { value: label }, and whether a product may have several values.
export const FACETS = {
  genre: { label: "Genre", multi: true, values: v(["Electronic", "EDM", "House", "Techno", "Trance", "Dubstep", ["drum-and-bass", "Drum & Bass"],
    "Trap", ["hip-hop", "Hip-Hop"], ["lo-fi", "Lo-Fi"], "Ambient", "Pop", "Synthwave", "Experimental", "Cinematic", "Bass"]) },
  style: { label: "Style", multi: true, values: v(["Glitch", "IDM", ["glitch-hop", "Glitch Hop"], ["future-bass", "Future Bass"], "Industrial", "Breakbeat",
    "Melodic", "Minimal", ["sound-design", "Sound design"]]) },
  mood: { label: "Mood", multi: true, values: v(["Dark", "Euphoric", "Melodic", "Aggressive", "Chill", "Playful", "Emotional", "Chaotic"]) },
  energy: { label: "Energy", multi: false, values: v(["Low", "Medium", "High"]) },
  use: { label: "Made for", multi: true, values: v([["production", "Music production"], ["sound-design", "Sound design"], ["remixing", "Remixing"],
    ["live-sets", "Live sets"], ["dj-sets", "DJ sets"], ["listening", "Listening"], ["live-visuals", "Live visuals"], ["wallpapers", "Wallpapers"]]) },
  contents: { label: "Contents", multi: true, values: v([["drum-hits", "Drum hits"], ["one-shots", "One-shots"], ["loops", "Loops"], ["midi", "MIDI"],
    ["presets", "Presets"], ["vocals", "Vocals"], ["textures", "Textures"], ["fx", "FX"], ["construction-kits", "Construction kits"], ["stems", "Stems"],
    ["tracks", "Tracks"], ["images", "Images"], ["video-loops", "Video loops"]]) },
  format: { label: "File format", multi: true, values: v([["wav", "WAV"], ["aiff", "AIFF"], ["flac", "FLAC"], ["mp3", "MP3"], ["midi", "MIDI"],
    ["fxp", "FXP preset"], ["vital-preset", "Vital preset"], ["png", "PNG"], ["jpg", "JPEG"], ["mp4", "MP4"], ["mov", "MOV"]]) },
  daw: { label: "DAW", multi: true, values: v([["any-daw", "Any DAW"], ["ableton-live", "Ableton Live"], ["fl-studio", "FL Studio"], ["logic-pro", "Logic Pro"],
    ["bitwig", "Bitwig Studio"], ["cubase", "Cubase"], ["reaper", "REAPER"], ["pro-tools", "Pro Tools"]]) },
  plugin: { label: "Plugin", multi: true, values: v(["Serum", "Vital", "Massive", "Phase Plant", "Resolume"]) },
  key: { label: "Key", multi: true, values: v(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    .flatMap((n) => [[`${n.toLowerCase().replace("#", "s")}-major`, `${n} major`], [`${n.toLowerCase().replace("#", "s")}-minor`, `${n} minor`]])) },
  os: { label: "System", multi: true, values: v([["windows", "Windows"], ["macos", "macOS"], ["linux", "Linux"]]) },
  skill: { label: "Level", multi: false, values: v(["Beginner", "Intermediate", "Advanced"]) }
};

// Which facets (and numeric fields) mean something for each kind of product (keys of data/product-types.js). A facet
// not listed here is ignored for that kind, so a filter only appears where it makes sense.
const SOUND = ["genre", "style", "mood", "energy", "use", "contents", "format", "daw", "key", "skill"];
export const SCHEMAS = {
  "sample-pack": { facets: SOUND, bpm: true, specs: ["sampleRate", "bitDepth"] },
  samples: { facets: SOUND, bpm: true, specs: ["sampleRate", "bitDepth"] },
  stems: { facets: ["genre", "style", "mood", "energy", "use", "contents", "format", "daw", "key"], bpm: true, specs: ["sampleRate", "bitDepth"] },
  presets: { facets: ["genre", "style", "mood", "use", "contents", "format", "plugin", "os", "skill"], bpm: false, specs: [] },
  music: { facets: ["genre", "style", "mood", "energy", "use", "contents", "format"], bpm: true, specs: ["sampleRate", "bitDepth"] },
  visuals: { facets: ["style", "use", "contents", "format", "plugin"], bpm: false, specs: [] },
  "vj-loops": { facets: ["style", "use", "contents", "format", "plugin"], bpm: false, specs: [] },
  template: { facets: ["style"], bpm: false, specs: [] },
  other: { facets: ["genre", "use", "contents", "format"], bpm: false, specs: [] }
};
export const SPECS = { sampleRate: { label: "Sample rate", values: [44100, 48000, 88200, 96000], unit: "kHz" }, bitDepth: { label: "Bit depth", values: [16, 24, 32], unit: "-bit" } };
export const BPM = { min: 40, max: 250 };
export const LIMITS = { valuesPerFacet: 12 };

// ---------- Assets (files inside Pacs): one vocabulary for the Pack Builder, the engine, Your Stacc and the store ----------

// What a file really is, identified from its bytes by the processing engine (engine/src/formats.rs uses the same slugs
// and extensions; test/unit/asset-vocabulary.test.js keeps the two, and server/files/policy.js, in step). ext: file
// extensions, lower-case. facet: the store's `format` facet value it counts as (null: not a store filter).
export const FORMATS = {
  wav: { label: "WAV", ext: ["wav", "wave"], facet: "wav" },
  aiff: { label: "AIFF", ext: ["aif", "aiff", "aifc"], facet: "aiff" },
  flac: { label: "FLAC", ext: ["flac"], facet: "flac" },
  mp3: { label: "MP3", ext: ["mp3"], facet: "mp3" },
  ogg: { label: "Ogg", ext: ["ogg", "oga"], facet: null },
  midi: { label: "MIDI", ext: ["mid", "midi"], facet: "midi" },
  fxp: { label: "FXP/FXB preset", ext: ["fxp", "fxb"], facet: "fxp" },
  vital: { label: "Vital preset", ext: ["vital", "vitalbank", "vitalpreset"], facet: "vital-preset" },
  serum: { label: "Serum preset", ext: ["serumpreset", "serumpack"], facet: null },
  h2p: { label: "u-he preset", ext: ["h2p"], facet: null },
  nmsv: { label: "Massive preset", ext: ["nmsv"], facet: null },
  adg: { label: "Ableton device group", ext: ["adg"], facet: null },
  adv: { label: "Ableton device preset", ext: ["adv"], facet: null },
  "bitwig-preset": { label: "Bitwig preset", ext: ["bwpreset"], facet: null },
  "bitwig-clip": { label: "Bitwig clip", ext: ["bwclip"], facet: null },
  sfz: { label: "SFZ instrument", ext: ["sfz"], facet: null },
  sf2: { label: "SoundFont", ext: ["sf2"], facet: null },
  exs: { label: "EXS instrument", ext: ["exs"], facet: null },
  kontakt: { label: "Kontakt", ext: ["nki", "nkm", "nkx", "nkc", "ncw"], facet: null },
  als: { label: "Ableton Live Set", ext: ["als"], facet: null },
  alp: { label: "Ableton Live Pack", ext: ["alp"], facet: null },
  flp: { label: "FL Studio project", ext: ["flp"], facet: null },
  logicx: { label: "Logic Pro project", ext: ["logicx"], facet: null },
  rpp: { label: "REAPER project", ext: ["rpp"], facet: null },
  ptx: { label: "Pro Tools session", ext: ["ptx"], facet: null },
  cpr: { label: "Cubase project", ext: ["cpr"], facet: null },
  song: { label: "Studio One song", ext: ["song"], facet: null },
  "bitwig-project": { label: "Bitwig project", ext: ["bwproject"], facet: null },
  zip: { label: "ZIP archive", ext: ["zip"], facet: null },
  pdf: { label: "PDF", ext: ["pdf"], facet: null },
  text: { label: "Text", ext: ["txt", "md"], facet: null },
  png: { label: "PNG", ext: ["png"], facet: "png" },
  jpg: { label: "JPEG", ext: ["jpg", "jpeg"], facet: "jpg" },
  gif: { label: "GIF", ext: ["gif"], facet: null },
  webp: { label: "WebP", ext: ["webp"], facet: null },
  mp4: { label: "MP4", ext: ["mp4", "m4a", "mov"], facet: "mp4" },
  webm: { label: "WebM", ext: ["webm"], facet: null }
};

// What an asset is for (its kind): Your Stacc groups by it, the Pack Builder suggests it, the store's `contents` facet
// is derived from it. formats: the formats a file of unknown kind is filed under by default (first match in this order).
// contents: the product `contents` facet value it counts as. data/content-types.js is generated from this.
export const KINDS = {
  "one-shots": { label: "One-shots", formats: ["wav", "aiff", "flac", "mp3", "ogg"], contents: "one-shots" },
  loops: { label: "Loops", formats: [], contents: "loops" },
  stems: { label: "Stems", formats: [], contents: "stems" },
  midi: { label: "MIDI", formats: ["midi"], contents: "midi" },
  presets: { label: "Presets", formats: ["fxp", "vital", "serum", "h2p", "nmsv", "adg", "adv", "bitwig-preset"], contents: "presets" },
  "sample-libraries": { label: "Sample libraries", formats: ["sfz", "sf2", "exs", "kontakt"], contents: null },
  "project-files": { label: "Project files", formats: ["als", "alp", "flp", "logicx", "rpp", "ptx", "cpr", "song", "bitwig-project", "bitwig-clip", "zip"], contents: null },
  images: { label: "Images", formats: ["png", "jpg", "webp", "gif"], contents: "images" },
  video: { label: "Video", formats: ["mp4", "webm"], contents: "video-loops" },
  documents: { label: "Documents", formats: ["pdf", "text"], contents: null },
  other: { label: "Other", formats: [], contents: null }
};
// Older or casual names for a kind ("samples" was the kind for all audio until 2026-10-10; stored files keep it).
export const KIND_SYNONYMS = {
  samples: "one-shots", sample: "one-shots", "one-shot": "one-shots", oneshots: "one-shots", oneshot: "one-shots", hits: "one-shots",
  loop: "loops", stem: "stems", "midi-files": "midi", "midi-patterns": "midi", preset: "presets", patches: "presets",
  instruments: "sample-libraries", "sample-library": "sample-libraries", project: "project-files", projects: "project-files",
  docs: "documents", doc: "documents", documentation: "documents", image: "images", artwork: "images", videos: "video"
};
// A MIDI asset's role, kept apart from its kind (MIDI is one kind; pattern vs arrangement is a detail of it).
export const MIDI_ROLES = { pattern: "Pattern", arrangement: "Arrangement" };
// An asset's instrument or role, for suggestions from file and folder names and, later, the store's filters.
export const INSTRUMENTS = v(["Drums", "Kick", "Snare", "Clap", "Hats", "Cymbals", "Percussion", "Bass", "808", "Synth", "Lead", "Pad",
  "Pluck", "Arp", "Keys", "Piano", "Guitar", "Strings", "Brass", "Vocals", "FX", "Textures", "Atmosphere"]);

// Facets the store derives from a product's published files (server/discovery/contents.js, docs/packs.md Phase 7) and
// nobody sets by hand: no product kind lists them, so the Studio refuses them, and the store offers them wherever some
// product has such files. Contents, format, key, DAW and plugin are derived too, beside what the creator chose.
export const DERIVED_FACETS = ["instrument", "sample-rate", "bit-depth"];
FACETS.instrument = { label: "Instrument", multi: true, derived: true, values: INSTRUMENTS };
FACETS["sample-rate"] = { label: "Sample rate", multi: true, derived: true, values: { 44100: "44.1 kHz", 48000: "48 kHz", 88200: "88.2 kHz", 96000: "96 kHz" } };
FACETS["bit-depth"] = { label: "Bit depth", multi: true, derived: true, values: { 16: "16-bit", 24: "24-bit", 32: "32-bit" } };

// Other words for an instrument in file and folder names (plurals of the values are added automatically).
export const INSTRUMENT_SYNONYMS = {
  kickdrum: "kick", bd: "kick", sd: "snare", snr: "snare", claps: "clap", hat: "hats", hihat: "hats", "hi-hat": "hats", hh: "hats",
  "open-hat": "hats", "closed-hat": "hats", cymbal: "cymbals", crash: "cymbals", ride: "cymbals", perc: "percussion", percs: "percussion",
  drum: "drums", sub: "bass", bassline: "bass", basses: "bass", "808s": "808", synths: "synth", leads: "lead", pads: "pad", plucks: "pluck",
  arps: "arp", arpeggio: "arp", rhodes: "keys", epiano: "keys", gtr: "guitar", guitars: "guitar", string: "strings",
  horns: "brass", vox: "vocals", vocal: "vocals", voice: "vocals", chops: "vocals", sfx: "fx", fxs: "fx", riser: "fx", risers: "fx",
  impact: "fx", impacts: "fx", sweep: "fx", texture: "textures", atmos: "atmosphere", atmospheres: "atmosphere", ambience: "atmosphere"
};
// Words in names that tell a MIDI file's role.
export const MIDI_ROLE_WORDS = { pattern: "pattern", patterns: "pattern", arrangement: "arrangement", arrangements: "arrangement", song: "arrangement" };

// What the processing engine needs to suggest values from names and headers (engine/src/classify.rs; docs/engine.md):
// the kinds with the formats filed under them, and the words that mean a kind, an instrument or a MIDI role. The engine
// compiles none of this in; the server sends it with each job. engine/conformance/vocabulary.json is generated from it.
export function engineVocabulary() {
  const words = (pairs) => Object.fromEntries(pairs.filter(([w]) => w).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const kind = [...Object.entries(KINDS).flatMap(([k, x]) => [[k, k], [fold(x.label), k]]), ...Object.entries(KIND_SYNONYMS)];
  const instrument = [
    ...Object.entries(INSTRUMENTS).flatMap(([k, label]) => [[k, k], [fold(label), k], [/s$/.test(k) ? "" : `${k}s`, k]]),
    ...Object.entries(INSTRUMENT_SYNONYMS)
  ];
  return {
    version: 1,
    kinds: Object.fromEntries(Object.entries(KINDS).map(([k, x]) => [k, { formats: x.formats }])),
    words: { kind: words(kind), instrument: words(instrument), midiRole: words(Object.entries(MIDI_ROLE_WORDS)) },
    keys: Object.keys(FACETS.key.values),
    bpm: BPM
  };
}

// The canonical kind for a word, or null.
export function kindOf(word) {
  const w = fold(word);
  if (KINDS[w]) return w;
  return KIND_SYNONYMS[w] || null;
}

// The canonical format for a file extension, or null when AutoStacc doesn't know it.
export function formatOfExtension(ext) {
  const e = String(ext || "").toLowerCase();
  return Object.keys(FORMATS).find((f) => FORMATS[f].ext.includes(e)) || null;
}

// What the browser's library needs (data/content-types.js is generated from this by scripts/build.js): each kind with
// its label and the file extensions filed under it by default, plus the old names that still mean a kind.
export function contentTypes() {
  const types = Object.fromEntries(Object.entries(KINDS).map(([k, x]) => [k, { label: x.label, formats: x.formats.flatMap((f) => FORMATS[f].ext) }]));
  return { types, aliases: { ...KIND_SYNONYMS } };
}

// Words creators type that mean an existing value (lowercased, punctuation folded to hyphens).
export const SYNONYMS = {
  genre: { dnb: "drum-and-bass", "d-b": "drum-and-bass", "drum-n-bass": "drum-and-bass", hiphop: "hip-hop", lofi: "lo-fi", "electronic-dance-music": "edm" },
  contents: { "one-shot": "one-shots", oneshots: "one-shots", loop: "loops", drums: "drum-hits", "drum-kit": "drum-hits", vocal: "vocals", "vocal-chops": "vocals",
    preset: "presets", stem: "stems", track: "tracks", sfx: "fx", texture: "textures", kits: "construction-kits" },
  format: { wave: "wav", aif: "aiff", mid: "midi", jpeg: "jpg", "serum-preset": "fxp" },
  daw: { ableton: "ableton-live", live: "ableton-live", fl: "fl-studio", "fruity-loops": "fl-studio", logic: "logic-pro", "any": "any-daw" },
  plugin: { "xfer-serum": "serum" },
  os: { mac: "macos", osx: "macos", win: "windows" }
};

export const fold = (s) => String(s).toLowerCase().normalize("NFKD").replace(/#/g, "s").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// One word to its canonical value for a facet, or null when it isn't in the vocabulary.
export function canonical(facet, word) {
  const f = FACETS[facet];
  if (!f) return null;
  const w = fold(word);
  if (f.values[w]) return w;
  const syn = (SYNONYMS[facet] || {})[w];
  if (syn && f.values[syn]) return syn;
  const byLabel = Object.keys(f.values).find((k) => fold(f.values[k]) === w);
  return byLabel || null;
}

export const label = (facet, value) => (FACETS[facet] && FACETS[facet].values[value]) || value;
export const schemaOf = (type) => SCHEMAS[type] || SCHEMAS.other;

// Turns { facet: [words] } into clean, deduplicated canonical values for this kind of product. Returns { facets, errors }:
// unknown words and facets that don't apply to the kind are errors (the caller decides to fail or to warn).
export function cleanFacets(type, input = {}) {
  const errors = [];
  const out = {};
  const allowed = schemaOf(type).facets;
  for (const [facet, raw] of Object.entries(input || {})) {
    if (!FACETS[facet]) { errors.push(`unknown field "${facet}"`); continue; }
    if (!allowed.includes(facet)) { errors.push(`"${FACETS[facet].label}" doesn't apply to this kind of product`); continue; }
    const words = Array.isArray(raw) ? raw : [raw];
    const values = [];
    for (const w of words) {
      const c = canonical(facet, w);
      if (!c) errors.push(`"${w}" isn't a known ${FACETS[facet].label.toLowerCase()}`);
      else if (!values.includes(c)) values.push(c);
    }
    if (!FACETS[facet].multi && values.length > 1) errors.push(`${FACETS[facet].label} takes one value`);
    if (values.length > LIMITS.valuesPerFacet) errors.push(`up to ${LIMITS.valuesPerFacet} values for ${FACETS[facet].label}`);
    if (values.length) out[facet] = values.slice(0, FACETS[facet].multi ? LIMITS.valuesPerFacet : 1);
  }
  return { facets: out, errors };
}

// A BPM range [min, max] (or one number) for a kind that has tempo; { bpm: [min, max] | null, errors }.
export function cleanBpm(type, raw) {
  if (raw === undefined || raw === null || raw === "") return { bpm: null, errors: [] };
  if (!schemaOf(type).bpm) return { bpm: null, errors: ["BPM doesn't apply to this kind of product"] };
  const pair = (Array.isArray(raw) ? raw : [raw, raw]).map(Number);
  const [lo, hi] = pair.length === 1 ? [pair[0], pair[0]] : pair;
  if (![lo, hi].every((n) => Number.isInteger(n) && n >= BPM.min && n <= BPM.max) || lo > hi) {
    return { bpm: null, errors: [`BPM is a whole number from ${BPM.min} to ${BPM.max} (a range low to high)`] };
  }
  return { bpm: [lo, hi], errors: [] };
}

// Technical specs ({ sampleRate, bitDepth }) from the allowed values only.
export function cleanSpecs(type, raw = {}) {
  const errors = [];
  const out = {};
  for (const [k, value] of Object.entries(raw || {})) {
    const spec = SPECS[k];
    if (!spec || !schemaOf(type).specs.includes(k)) { errors.push(`"${k}" doesn't apply to this kind of product`); continue; }
    if (!spec.values.includes(Number(value))) errors.push(`${spec.label} is one of ${spec.values.join(", ")}`);
    else out[k] = Number(value);
  }
  return { specs: out, errors };
}

// Values worth suggesting from a product's own words (title, description, tags): only exact vocabulary words or
// synonyms that appear in the text, never guesses. Suggestions are shown to the creator to accept, not applied.
export function suggestFacets(type, text) {
  const words = new Set(fold(text).split("-").filter(Boolean));
  const joined = `-${fold(text)}-`;
  const out = {};
  for (const facet of schemaOf(type).facets) {
    const hits = new Set();
    for (const value of Object.keys(FACETS[facet].values)) {
      if (value.length > 2 && (words.has(value) || joined.includes(`-${value}-`))) hits.add(value);
    }
    for (const [word, value] of Object.entries(SYNONYMS[facet] || {})) if (word.length > 2 && joined.includes(`-${word}-`)) hits.add(value);
    if (hits.size) out[facet] = [...hits];
  }
  return out;
}

// The lower-case text search matches: title, description, tags, the labels of its facet values and who made it.
export function searchText({ title = "", description = "", tags = [], facets = {}, by = "" }) {
  const labels = Object.entries(facets).flatMap(([f, values]) => values.map((x) => label(f, x)));
  return [title, description, ...tags, ...labels, by].join(" ").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 4000);
}

// What the browser needs to label and filter (data/vocabulary.js is generated from this by scripts/build.js).
export const browserVocabulary = () => ({
  facets: Object.fromEntries(Object.entries(FACETS).map(([k, f]) => [k, { label: f.label, multi: f.multi, values: f.values }])),
  schemas: SCHEMAS, specs: SPECS, bpm: BPM,
  // What a file can be given in the Pack Builder's review (kinds come from data/content-types.js).
  assets: { instruments: INSTRUMENTS, midiRoles: MIDI_ROLES }
});

// Whether `value` is something a creator may set for an asset's `field` (Pack Builder, server/packs/edits.js): a known
// kind, instrument, key or MIDI role, or a tempo in range. "" (none) is always allowed.
export function assetValueOk(field, value) {
  if (value === "") return true;
  if (typeof value !== "string" || value.length > 40) return false;
  if (field === "kind") return Object.prototype.hasOwnProperty.call(KINDS, value);
  if (field === "instrument") return Object.prototype.hasOwnProperty.call(INSTRUMENTS, value);
  if (field === "key") return Object.prototype.hasOwnProperty.call(FACETS.key.values, value);
  if (field === "midiRole") return Object.prototype.hasOwnProperty.call(MIDI_ROLES, value);
  if (field === "bpm") return /^\d{2,3}(\.\d{1,2})?$/.test(value) && Number(value) >= BPM.min && Number(value) <= BPM.max;
  return false;
}

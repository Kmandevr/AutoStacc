// Limits for paid files (D1 product_files, private R2 FILES): what can be uploaded to a product. Today only the admin
// uploads; when creators upload their own products the same checks run, plus their storage quota. Extensions come from
// data/content-types.js's formats plus a few common ones; the content is never run or shown, only downloaded.
import { fail } from "../lib/http.js";

export const FILE_LIMITS = {
  fileBytes: 95 * 1024 * 1024, // Workers request bodies stop at 100 MB.
  filesPerProduct: 100
};

// What may be sold, by extension: its content type (set here, never taken from the uploader) and, for formats with a
// reliable signature, the check on the file's first bytes. Formats without one (synth presets, DAW projects, samplers)
// are accepted by extension alone and always served as an attachment; nothing uploaded is ever run or shown in a page.
// No scripts, executables, HTML or SVG: they have no place in a sound store. A new format is one line here.
const bytesAre = (b, at, text) => [...text].every((c, i) => b[at + i] === c.charCodeAt(0));
const MPEG_FTYP = (b) => ["ftyp", "moov", "mdat", "wide", "free", "skip"].some((t) => bytesAre(b, 4, t));
const SIG = {
  zip: (b) => bytesAre(b, 0, "PK") && ((b[2] === 3 && b[3] === 4) || (b[2] === 5 && b[3] === 6)),
  wav: (b) => bytesAre(b, 0, "RIFF") && bytesAre(b, 8, "WAVE"),
  aiff: (b) => bytesAre(b, 0, "FORM") && (bytesAre(b, 8, "AIFF") || bytesAre(b, 8, "AIFC")),
  flac: (b) => bytesAre(b, 0, "fLaC"),
  mp3: (b) => bytesAre(b, 0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  ogg: (b) => bytesAre(b, 0, "OggS"),
  mp4: MPEG_FTYP,
  webm: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  png: (b) => b[0] === 0x89 && bytesAre(b, 1, "PNG\r\n"),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => bytesAre(b, 0, "GIF8") && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61,
  webp: (b) => bytesAre(b, 0, "RIFF") && bytesAre(b, 8, "WEBP"),
  pdf: (b) => bytesAre(b, 0, "%PDF-"),
  midi: (b) => bytesAre(b, 0, "MThd"),
  text: (b) => ![...b].includes(0)
};
const FILE_TYPES = {
  mid: ["audio/midi", "midi"], midi: ["audio/midi", "midi"],
  wav: ["audio/wav", "wav"], aif: ["audio/aiff", "aiff"], aiff: ["audio/aiff", "aiff"], flac: ["audio/flac", "flac"],
  mp3: ["audio/mpeg", "mp3"], ogg: ["audio/ogg", "ogg"], m4a: ["audio/mp4", "mp4"],
  zip: ["application/zip", "zip"], png: ["image/png", "png"], jpg: ["image/jpeg", "jpg"], jpeg: ["image/jpeg", "jpg"],
  webp: ["image/webp", "webp"], gif: ["image/gif", "gif"], mp4: ["video/mp4", "mp4"], mov: ["video/quicktime", "mp4"],
  webm: ["video/webm", "webm"], pdf: ["application/pdf", "pdf"], txt: ["text/plain", "text"], md: ["text/plain", "text"],
  // presets, sampler instruments and DAW projects: no fixed signature
  fxp: [], fxb: [], vital: [], vitalbank: [], vitalpreset: [], h2p: [], nmsv: [], adv: [], adg: [], serumpreset: [], serumpack: [],
  sfz: [], sf2: [], exs: [], nki: [],
  als: [], alp: [], flp: [], logicx: [], rpp: [], ptx: [], cpr: [], song: [], bwproject: []
};
export const ALLOWED_EXTENSIONS = new Set(Object.keys(FILE_TYPES));
// Previews are public audio clips played in the page: only these.
export const PREVIEW_EXTENSIONS = new Set(["mp3", "m4a", "ogg", "wav"]);

export const extensionOf = (filename) => (String(filename).match(/\.([a-z0-9]{1,12})$/i) || [])[1]?.toLowerCase() || "";

// Throws the right 4xx for a file that may not be added to a product with `existing` deliverable-or-pending files.
export function checkUpload({ filename, sizeBytes, existing }) {
  if (!sizeBytes) fail(411, "length_required", "Send the file with its size.");
  if (sizeBytes > FILE_LIMITS.fileBytes) fail(413, "too_large", "Files must be under 95 MB per upload.");
  if (!ALLOWED_EXTENSIONS.has(extensionOf(filename))) fail(415, "unsupported_file_type", "That kind of file can't be sold here yet. Zip it, or ask for its type to be added.");
  if (existing >= FILE_LIMITS.filesPerProduct) fail(409, "limit_reached", `A product can have up to ${FILE_LIMITS.filesPerProduct} files.`);
}

// The content type to store and serve for an allowed extension (never the uploader's header).
export const contentTypeFor = (filename) => (FILE_TYPES[extensionOf(filename)] || [])[0] || "application/octet-stream";

// Does the file's start (at least 16 bytes of it) look like what its extension says? Formats without a signature pass.
export function looksLike(filename, head) {
  const kind = (FILE_TYPES[extensionOf(filename)] || [])[1];
  return !kind || Boolean(head.length && SIG[kind](head));
}

// Files a revision carries over instead of uploading them again (docs/packs.md, Phase 6): the browser checks the ZIP
// with the engine's WebAssembly build, asks which files this owner already has stored (knownHashes), and sends only the
// rest, in a thin ZIP (js/zip-thin.js), with the path and SHA-256 of each file it left out. Nothing it says is trusted:
// a carried path passes the engine's own path rules (engine/src/zipread.rs normalize_path, same codes); its hash must
// be one of this owner's stored originals that a version already used (so the engine checked those very bytes); and
// its extension must be one those bytes were checked under, or it is refused like a file whose contents don't match its
// name. The owner's originals are never shared across owners, so this reveals nothing about anyone else's files.
import { all } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { LIMITS } from "../creators/policy.js";

const SHA = /^[0-9a-f]{64}$/;
const RESERVED = new Set(["con", "prn", "aux", "nul", ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`com${n}`, `lpt${n}`])]);
const MAX_DEPTH = 32;
const MAX_PATH_BYTES = 1024;
const CHUNK = 400;
const ext = (name) => (String(name).match(/\.([^./]+)$/) || [])[1]?.toLowerCase() || "";
const isSystemFile = (p) => p.startsWith("__MACOSX/") || [".DS_Store", "Thumbs.db", "desktop.ini"].includes(p.slice(p.lastIndexOf("/") + 1));

/** A create request's carry list, checked for shape only (judged at import, when the bytes it names are known). */
export function cleanCarry(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > LIMITS.filesPerPacVersion) fail(400, "invalid_carry", "That list of files to keep isn't valid.");
  return list.map((c) => {
    if (!c || typeof c.path !== "string" || !c.path || c.path.length > MAX_PATH_BYTES || typeof c.sha256 !== "string" || !SHA.test(c.sha256)) {
      fail(400, "invalid_carry", "That list of files to keep isn't valid.");
    }
    return { path: c.path, sha256: c.sha256 };
  });
}

/** The engine's normalized path, or { code } saying why it's unsafe. */
export function normalizePath(raw) {
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { code: "control_characters" };
  const s = raw.replace(/\\/g, "/");
  if (s.startsWith("/") || s[1] === ":") return { code: "absolute_path" };
  const parts = [];
  for (const seg of s.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return { code: "path_traversal" };
    if (RESERVED.has(seg.split(".")[0].toLowerCase())) return { code: "reserved_name" };
    parts.push(seg.normalize("NFC"));
  }
  if (!parts.length) return { code: "empty_path" };
  if (parts.length > MAX_DEPTH) return { code: "too_deep" };
  const path = parts.join("/");
  if (new TextEncoder().encode(path).length > MAX_PATH_BYTES) return { code: "path_too_long" };
  return { path };
}

// This owner's stored originals that some version used, with every name they were checked under.
async function checkedBlobs(db, owner, hashes) {
  const out = new Map();
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const rows = await all(db, `SELECT b.sha256, b.id, b.r2_key, b.size_bytes, b.crc32, b.format, b.facts, e.filename FROM blobs b
      JOIN pac_entries e ON e.blob_id = b.id WHERE b.owner_scope = ? AND b.sha256 IN (SELECT value FROM json_each(?))`, owner, JSON.stringify(hashes.slice(i, i + CHUNK)));
    for (const r of rows) {
      const b = out.get(r.sha256) || { ...r, exts: new Set() };
      b.exts.add(ext(r.filename));
      out.set(r.sha256, b);
    }
  }
  return out;
}

/** Which of these hashes the owner already has, checked (for the browser, before it builds the thin ZIP). */
export async function knownHashes(db, owner, hashes) {
  return [...(await checkedBlobs(db, owner, [...new Set(hashes)])).keys()];
}

/**
 * At import: the carried files as kept files (like the engine's, with the stored original's facts and key) and the
 * refused ones. A hash the owner doesn't have (any more) fails the import: the browser must send that file.
 */
export async function resolveCarry(db, owner, carry) {
  const kept = [];
  const refused = [];
  if (!carry.length) return { kept, refused };
  const blobs = await checkedBlobs(db, owner, [...new Set(carry.map((c) => c.sha256))]);
  for (const c of carry) {
    const n = normalizePath(c.path);
    if (n.code) { refused.push({ path: c.path, codes: [n.code] }); continue; }
    if (isSystemFile(n.path)) continue;
    const b = blobs.get(c.sha256);
    if (!b) throw Object.assign(new Error("carried file missing"), { code: "missing_files" });
    if (!b.exts.has(ext(n.path))) { refused.push({ path: n.path, codes: ["content_does_not_match_name"] }); continue; }
    kept.push({ path: n.path, sha256: b.sha256, size: b.size_bytes, crc32: b.crc32, format: b.format, facts: JSON.parse(b.facts || "{}"),
      stored: b.r2_key, suggestions: [], carried: true });
  }
  return { kept, refused };
}

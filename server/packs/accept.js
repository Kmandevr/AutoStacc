// Which files a version keeps (docs/packs.md), before anything is stored: those the engine accepted AND the storage relay
// recorded identically (acceptStored), plus a thin ZIP's carried files from the owner's stored originals (carry.js);
// only types the store delivers; one name per folder ignoring case (after dropping one wrapper folder all files share);
// at most the agreed number of files; and, for a creator, only if they fit their storage unpacked. Anything else is
// refused with a code (the review and the builder show them).
import { first, parseJson } from "../lib/db.js";
import { writePrefix } from "../../workers/engine/src/jobs.js";
import { ALLOWED_EXTENSIONS, extensionOf } from "../files/policy.js";
import { LIMITS, filesQuotaOf } from "../creators/policy.js";
import { storageUsed } from "../creators/storage.js";
import { resolveCarry } from "./carry.js";
import { blobsByHash } from "../blobs/blobs.js";
import { jobWrites } from "./engine-client.js";

const refusedOf = (f) => (f.issues || []).filter((i) => i.refused).map((i) => i.code);

// Drops one wrapper folder all files share ("My Pack/…"): the product already names the Pac.
function logicalPaths(paths) {
  const tops = new Set(paths.map((p) => (p.includes("/") ? p.split("/")[0] : "")));
  const strip = tops.size === 1 && !tops.has("") ? [...tops][0].length + 1 : 0;
  return paths.map((p) => p.slice(strip));
}

/**
 * Which files of an engine's answer are kept: those it accepted whose stored key is exactly the n-th key under this
 * job's own prefix (built here, never taken from the engine) and whose bytes the relay recorded with the same SHA-256
 * and size. An answer naming any other object (another owner's, another job's) is refused, so an engine can't make a
 * version point at bytes it didn't write in this job. Pure, for tests.
 */
export function acceptStored(files, writes, prefix) {
  const kept = [];
  const refused = [];
  for (const f of files || []) {
    if (f.ignored) continue;
    const codes = refusedOf(f);
    const seg = typeof f.stored === "string" ? f.stored.slice(f.stored.lastIndexOf("/") + 1) : "";
    const key = /^[1-9][0-9]{0,5}$/.test(seg) ? prefix + seg : null;
    const w = key && key === f.stored ? writes[Number(seg)] : null;
    if (codes.length || !f.stored) refused.push({ path: f.path, codes: codes.length ? codes : ["not_stored"] });
    else if (!w || w.sha256 !== f.sha256 || w.size !== f.size) refused.push({ path: f.path, codes: ["storage_mismatch"] });
    else kept.push({ ...f, stored: key, sha256: w.sha256, size: w.size });
  }
  return { kept, refused };
}

/**
 * { kept: [{ ...file, logical }], refused: [{ path, codes }], carried: carried files kept, room: for a creator, the
 * { archive, bytes, quota } its storage check used (null for AutoStacc's own) } for a finished job.
 */
export async function keptFiles(app, version, job, { result, attempt }, { upload: only = null } = {}) {
  const writes = await jobWrites(app, job.id, attempt);
  const owner = version.owner_scope;
  const accepted = acceptStored(result.files, writes, writePrefix(owner, job.id, attempt));
  // A thin ZIP's files the browser left out, from this owner's stored originals (carry.js); refused ones join the rest.
  // only: an addition's own upload (append.js), with no carry list and its own size as the archive.
  const upload = only || (await first(app.db, "SELECT carry FROM uploads WHERE version_id = ? AND kind = 'zip'", version.id));
  const carried = await resolveCarry(app.db, owner, parseJson(upload ? upload.carry : "[]", []));
  accepted.kept.push(...carried.kept);
  accepted.refused.push(...carried.refused);
  const refused = accepted.refused;
  // Only kinds of files the store sells (server/files/policy.js, the same list as single uploads): nothing else reaches customers.
  const kept = accepted.kept.filter((f) => ALLOWED_EXTENSIONS.has(extensionOf(f.path)) || (refused.push({ path: f.path, codes: ["unsupported_type"] }), false));

  // One name per folder ignoring case (Windows and macOS would merge them); the engine already warned about these.
  const allPaths = logicalPaths(kept.map((f) => f.path));
  const seen = new Set();
  const named = [];
  kept.forEach((f, i) => {
    const unique = allPaths[i].toLowerCase();
    if (seen.has(unique)) refused.push({ path: f.path, codes: ["duplicate_name"] });
    else (seen.add(unique), named.push({ ...f, logical: allPaths[i] }));
  });
  kept.length = 0;
  kept.push(...named);
  // The agreed limit per version (docs/packs.md H7): a bigger Pac goes in as more than one Pac.
  if (kept.length > LIMITS.filesPerPacVersion) throw Object.assign(new Error("too many files"), { code: "too_many_files" });
  // A creator's storage counts the files as unpacked, not the archive they came in (an archive can compress a lot):
  // refused before anything is claimed if they don't fit beside what the creator already stores.
  const creator = await first(app.db, "SELECT * FROM creators WHERE id = ?", owner);
  let room = null;
  if (creator) {
    // Bytes this owner already stores (a carried file, a file the live version has) count once, already in storageUsed.
    const stored = await blobsByHash(app.db, owner, [...new Set(kept.map((f) => f.sha256).filter(Boolean))]);
    const fresh = new Map(kept.filter((f) => !stored[f.sha256]).map((f) => [f.sha256, f.size]));
    const bytes = [...fresh.values()].reduce((n, x) => n + x, 0);
    const archive = only ? only.size_bytes : (await first(app.db, "SELECT COALESCE(SUM(size_bytes), 0) AS n FROM uploads WHERE version_id = ? AND addition_id IS NULL", version.id)).n;
    if ((await storageUsed(app.db, owner)) - archive + bytes > filesQuotaOf(creator)) throw Object.assign(new Error("over quota"), { code: "quota_exceeded" });
    // Checked again inside the import's batch (two imports at once can't both squeeze in): import.js.
    room = { archive, bytes, quota: filesQuotaOf(creator) };
  }

  return { kept, refused, carried: carried.kept, room };
}

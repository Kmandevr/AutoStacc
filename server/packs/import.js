// Importing a finished `process` job into a version (docs/packs.md): the engine's answer says which files it accepted and
// where it stored each; the storage relay's own record says what was actually written (its SHA-256 and size). Only files
// on which both agree are kept. Each becomes an asset in the version's manifest, its bytes one stored original per owner
// and hash (a duplicate copy is deleted), its suggestions rows in asset_values. Then the uploaded archive and anything
// the job left over are deleted: the manifest is the record from here on (owner's decision, docs/decisions.md).
import { all, stmt, newId, now, guardStmt } from "../lib/db.js";
import { writePrefix } from "../../workers/engine/src/jobs.js";
import { claimStmts, blobsByHash } from "../blobs/blobs.js";
import { jobWrites, jobObjects } from "./engine-client.js";
import { moveStmt } from "./versions.js";
import { deleteKeys } from "../storage/buckets.js";

const CHUNK = 300;
const chunks = (rows) => Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => JSON.stringify(rows.slice(i * CHUNK, (i + 1) * CHUNK)));
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

export async function importResult(app, version, job, state) {
  const { result, attempt } = state;
  const writes = await jobWrites(app, job.id, attempt);
  const owner = version.owner_scope;
  const { kept, refused } = acceptStored(result.files, writes, writePrefix(owner, job.id, attempt));

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

  // 1. One stored original per owner and hash: claim, then learn which key each hash ended up with.
  if (kept.length) {
    await app.db.batch(claimStmts(app.db, owner, kept.map((f) => ({ key: f.stored, sha256: f.sha256, size: f.size, crc32: f.crc32,
      format: f.format, facts: f.facts, engineVersion: result.engineVersion }))));
  }
  const blobs = await blobsByHash(app.db, owner, [...new Set(kept.map((f) => f.sha256))]);

  // 2. Folders, assets, the manifest and suggestions, in one batch with the move to ready.
  const folders = new Map();
  const folderOf = (dir) => {
    if (!dir) return null;
    if (!folders.has(dir)) {
      const parent = dir.includes("/") ? folderOf(dir.slice(0, dir.lastIndexOf("/"))) : null;
      folders.set(dir, { id: newId("fo"), parent, name: dir.slice(dir.lastIndexOf("/") + 1), path: dir, sort: folders.size });
    }
    return folders.get(dir).id;
  };
  const entries = [];
  const values = [];
  const t = now();
  kept.forEach((f) => {
    const p = f.logical;
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    const filename = p.slice(p.lastIndexOf("/") + 1);
    const asset = newId("as");
    entries.push({ asset, folder: folderOf(dir), filename, original: f.path, blob: blobs[f.sha256].id, sort: entries.length });
    // One row per field, value and origin (the table's key), whatever an engine repeats.
    const said = new Set();
    for (const s of f.suggestions || []) {
      const k = JSON.stringify([s.field, s.value, s.origin]);
      if (said.has(k)) continue;
      said.add(k);
      values.push({ asset, field: s.field, value: s.value, origin: s.origin, confidence: s.confidence, blob: blobs[f.sha256].id });
    }
  });
  const bytes = kept.reduce((n, f) => n + f.size, 0);
  const stats = { files: entries.length, bytes, folders: folders.size, refused, ignored: (result.files || []).filter((f) => f.ignored).length };
  const db = app.db;
  const batch = [
    // Only while the version is still processing: if another request imported this answer first, all of this rolls back.
    guardStmt(db, "EXISTS (SELECT 1 FROM pac_versions WHERE id = ? AND status = 'processing')", version.id),
    // The originals this version uses are wanted now (newly claimed ones expire otherwise, see claimStmts).
    ...chunks(entries).map((json) => stmt(db, "UPDATE blobs SET delete_after = NULL WHERE id IN (SELECT j.value->>'blob' FROM json_each(?) j)", json)),
    ...chunks(entries).map((json) => stmt(db, "INSERT INTO assets (id, pac_id, created_at) SELECT j.value->>'asset', ?, ? FROM json_each(?) j", version.pac_id, t, json)),
    ...chunks([...folders.values()]).map((json) => stmt(db, `INSERT INTO pac_folders (id, version_id, parent_id, name, sort, original_path)
      SELECT j.value->>'id', ?, j.value->>'parent', j.value->>'name', j.value->>'sort', j.value->>'path' FROM json_each(?) j`, version.id, json)),
    ...chunks(entries).map((json) => stmt(db, `INSERT INTO pac_entries (version_id, asset_id, folder_id, filename, original_path, blob_id, sort, state)
      SELECT ?, j.value->>'asset', j.value->>'folder', j.value->>'filename', j.value->>'original', j.value->>'blob', j.value->>'sort', 'verified'
      FROM json_each(?) j`, version.id, json)),
    ...chunks(values).map((json) => stmt(db, `INSERT INTO asset_values (asset_id, field, value, origin, confidence, status, basis_blob_id, engine_version, updated_at)
      SELECT j.value->>'asset', j.value->>'field', j.value->>'value', j.value->>'origin', j.value->>'confidence', 'suggested', j.value->>'blob', ?, ?
      FROM json_each(?) j`, result.engineVersion || null, t, json)),
    stmt(db, "UPDATE pac_versions SET stats = ?, engine_version = ? WHERE id = ? AND status = 'processing'", JSON.stringify(stats), result.engineVersion || null, version.id),
    moveStmt(db, version.id, "processing", "ready"),
    stmt(db, "UPDATE processing_jobs SET status = 'done', attempt_used = ?, updated_at = ? WHERE id = ?", attempt, t, job.id)
  ];
  await db.batch(batch);

  // 3. After the commit: remove duplicate copies, everything else the job left, and the uploaded archive.
  const keep = new Set(Object.values(blobs).map((b) => b.key));
  const leftovers = (await jobObjects(app, owner, job.id)).filter((k) => !keep.has(k));
  const uploads = await all(db, "SELECT r2_key FROM uploads WHERE version_id = ?", version.id);
  await deleteKeys(app.env, [...leftovers, ...uploads.map((u) => u.r2_key)]);
  return stats;
}

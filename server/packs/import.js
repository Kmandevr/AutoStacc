// Importing a finished `process` job into a version (docs/packs.md): the files it keeps (accept.js: what the engine
// stored and the relay recorded identically, plus a thin ZIP's carried files). Each becomes an asset in the version's
// manifest (the live version's asset when it's the same file, revision.js), its bytes one stored original per owner
// and hash (a duplicate copy is deleted), its suggestions rows in asset_values. Then the uploaded archive and anything
// the job left over are deleted: the manifest is the record from here on (owner's decision, docs/decisions.md).
import { all, run, stmt, newId, now, guardStmt } from "../lib/db.js";
import { review } from "./review.js";
import { revisionOf } from "./revision.js";
import { keptFiles } from "./accept.js";
import { inUseSql } from "../creators/storage.js";
import { claimStmts, addPeaksStmt, blobsByHash } from "../blobs/blobs.js";
import { meterStmts, jobCost, capBytes } from "../usage/usage.js";
import { storedSql, storedBytes } from "../usage/storage.js";
import { jobObjects } from "./engine-client.js";
import { moveStmt } from "./versions.js";
import { deleteKeys } from "../storage/buckets.js";

const CHUNK = 300;
const chunks = (rows) => Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => JSON.stringify(rows.slice(i * CHUNK, (i + 1) * CHUNK)));
// A stored original's facts, plus its waveform when the engine listened to it (analysis peaks: measured from the bytes,
// so they live with them; 100 numbers 0 to 100).
const withPeaks = (f) => {
  const peaks = f.analysis && Array.isArray(f.analysis.peaks) ? f.analysis.peaks.filter((p) => Number.isInteger(p) && p >= 0 && p <= 100).slice(0, 100) : [];
  return peaks.length ? { ...f.facts, peaks } : f.facts;
};

/** Claims a stored original for each kept file not carried (one per owner and hash) and gives a waveform to those
 * without one. → { sha256: { id, key } } for every kept file (also used by append.js). */
export async function claimOriginals(app, owner, kept, engineVersion) {
  const fresh = kept.filter((f) => !f.carried);
  if (fresh.length) {
    const heard = fresh.map((f) => ({ sha256: f.sha256, peaks: withPeaks(f).peaks })).filter((f) => f.peaks);
    await app.db.batch([...claimStmts(app.db, owner, fresh.map((f) => ({ key: f.stored, sha256: f.sha256, size: f.size, crc32: f.crc32,
      format: f.format, facts: withPeaks(f), engineVersion }))), ...(heard.length ? [addPeaksStmt(app.db, owner, heard)] : [])]);
  }
  const blobs = await blobsByHash(app.db, owner, [...new Set(kept.map((f) => f.sha256))]);
  if (kept.some((f) => !blobs[f.sha256])) throw Object.assign(new Error("carried file missing"), { code: "missing_files" });
  return blobs;
}

/** One row per field, value and origin (the table's key) of a kept file's suggestions, whatever an engine repeats. */
export function valuesOf(f, asset, blobId) {
  const said = new Set();
  const out = [];
  for (const s of f.suggestions || []) {
    const k = JSON.stringify([s.field, s.value, s.origin]);
    if (said.has(k)) continue;
    said.add(k);
    out.push({ asset, field: s.field, value: s.value, origin: s.origin, confidence: s.confidence, blob: blobId });
  }
  return out;
}

/** Writes suggestion rows (valuesOf), keeping each row's status (accepted/rejected stays). */
export const valueStmts = (db, values, engineVersion, t) => chunks(values).map((json) => stmt(db, `INSERT INTO asset_values (asset_id, field, value, origin, confidence, status, basis_blob_id, engine_version, updated_at)
      SELECT j.value->>'asset', j.value->>'field', j.value->>'value', j.value->>'origin', j.value->>'confidence', 'suggested', j.value->>'blob', ?, ?
      FROM json_each(?) j WHERE true
      ON CONFLICT (asset_id, field, value, origin) DO UPDATE SET confidence = excluded.confidence, basis_blob_id = excluded.basis_blob_id,
        engine_version = excluded.engine_version, updated_at = excluded.updated_at`, engineVersion || null, t, json));

export async function importResult(app, version, job, state) {
  const { result, attempt } = state;
  const owner = version.owner_scope;
  const { kept, refused, carried, room } = await keptFiles(app, version, job, state);
  // For the automated review: how many of these the owner already had. As a revision of the live version
  // (revision.js): which files are the live version's files, and which folders its folders.
  const already = await blobsByHash(app.db, owner, [...new Set(kept.map((f) => f.sha256))]);
  // A creator's files also have to fit in what AutoStacc lets creators fill (server/usage/): the originals not stored
  // yet, beside everything stored, less the archive they came in (deleted after this). Checked again in the batch.
  const cap = room ? await capBytes(app.db) : null;
  if (room) {
    const fresh = new Map(kept.filter((f) => !f.carried && !already[f.sha256]).map((f) => [f.sha256, f.size]));
    const adding = [...fresh.values()].reduce((n, b) => n + b, 0);
    if ((await storedBytes(app.db)) - room.archive + adding > cap) throw Object.assign(new Error("storage full"), { code: "storage_full" });
  }
  const rev = await revisionOf(app.db, version, kept);

  // 1. One stored original per owner and hash: claim, then learn which key each hash ended up with. Carried files
  // already are stored originals: never claimed again (a row the sweep removed meanwhile must not come back pointing
  // at a deleted object), and the batch below goes ahead only while they all still exist.
  const blobs = await claimOriginals(app, owner, kept, result.engineVersion);
  const carriedIds = [...new Set(carried.map((f) => f.blobId))];

  // 2. Folders, assets, the manifest and suggestions, in one batch with the move to ready.
  const folders = new Map();
  const folderOf = (dir) => {
    if (!dir) return null;
    if (!folders.has(dir)) {
      const parent = dir.includes("/") ? folderOf(dir.slice(0, dir.lastIndexOf("/"))) : null;
      folders.set(dir, { id: rev.folderIdOf(dir) || newId("fo"), parent, name: dir.slice(dir.lastIndexOf("/") + 1), path: dir, sort: folders.size });
    }
    return folders.get(dir).id;
  };
  const entries = [];
  const values = [];
  const t = now();
  kept.forEach((f, i) => {
    const p = f.logical;
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    const filename = p.slice(p.lastIndexOf("/") + 1);
    const asset = rev.assetOf(i) || newId("as");
    entries.push({ asset, isNew: !rev.assetOf(i), folder: folderOf(dir), filename, original: f.path, blob: blobs[f.sha256].id, sort: entries.length });
    values.push(...valuesOf(f, asset, blobs[f.sha256].id));
  });
  const bytes = kept.reduce((n, f) => n + f.size, 0);
  const stats = { files: entries.length, bytes, carried: kept.filter((f) => f.carried).length, folders: folders.size, refused, ignored: (result.files || []).filter((f) => f.ignored).length,
    // "Already stored" means elsewhere: files this Pac's live version has are a revision's unchanged files, not duplicates.
    review: review({ result: { ...result, files: [...(result.files || []), ...carried] }, kept, refused,
      existingHashes: kept.filter((f) => already[f.sha256] && !(rev.previous && f.sha256 in rev.previous)).length,
      revision: rev.risk }),
    // As a revision: what changed, with the files that are new to this Pac marked too.
    ...(rev.summary ? { diff: { ...rev.summary, changes: { ...rev.summary.changes, ...Object.fromEntries(entries.filter((e) => e.isNew).map((e) => [e.asset, "new"])) } } } : {}) };
  // The live version's folders this version keeps carry their defaults over.
  const keptFolders = [...folders.values()].filter((fo) => rev.folderIdOf(fo.path) === fo.id).map((fo) => ({ id: fo.id }));
  const db = app.db;
  const batch = [
    // Only while the version is still processing: if another request imported this answer first, all of this rolls back.
    guardStmt(db, "EXISTS (SELECT 1 FROM pac_versions WHERE id = ? AND status = 'processing')", version.id),
    // If either of these fails, nothing is written and the version stays processing: the next look re-imports it and
    // fails it with the reason (missing_files, quota_exceeded).
    ...(carriedIds.length ? [guardStmt(db, "(SELECT COUNT(*) FROM blobs WHERE id IN (SELECT value FROM json_each(?))) = ?", JSON.stringify(carriedIds), carriedIds.length)] : []),
    // The originals were claimed above, so the creator's storage already counts them (creators/storage.js); the archive
    // they came in goes next.
    ...(room ? [guardStmt(db, `${inUseSql("?1")} - ?2 <= ?3`, owner, room.archive, room.quota),
      guardStmt(db, `${storedSql()} - ?1 <= ?2`, room.archive, cap)] : []),
    // The originals this version uses are wanted now (newly claimed ones expire otherwise, see claimStmts).
    ...chunks(entries).map((json) => stmt(db, "UPDATE blobs SET delete_after = NULL WHERE id IN (SELECT j.value->>'blob' FROM json_each(?) j)", json)),
    // New assets only: a file matched to the live version keeps its asset, and the values said about it.
    ...chunks(entries.filter((e) => e.isNew)).map((json) => stmt(db, "INSERT INTO assets (id, pac_id, created_at) SELECT j.value->>'asset', ?, ? FROM json_each(?) j", version.pac_id, t, json)),
    ...chunks(keptFolders).map((json) => stmt(db, `INSERT INTO pac_folder_values (version_id, folder_id, field, value, set_by, set_at)
      SELECT ?, folder_id, field, value, set_by, set_at FROM pac_folder_values WHERE version_id = ? AND folder_id IN (SELECT j.value->>'id' FROM json_each(?) j)`,
      version.id, rev.liveId, json)),
    ...chunks([...folders.values()]).map((json) => stmt(db, `INSERT INTO pac_folders (id, version_id, parent_id, name, sort, original_path)
      SELECT j.value->>'id', ?, j.value->>'parent', j.value->>'name', j.value->>'sort', j.value->>'path' FROM json_each(?) j`, version.id, json)),
    ...chunks(entries).map((json) => stmt(db, `INSERT INTO pac_entries (version_id, asset_id, folder_id, filename, original_path, blob_id, sort, state)
      SELECT ?, j.value->>'asset', j.value->>'folder', j.value->>'filename', j.value->>'original', j.value->>'blob', j.value->>'sort', 'verified'
      FROM json_each(?) j`, version.id, json)),
    ...valueStmts(db, values, result.engineVersion, t),
    stmt(db, "UPDATE pac_versions SET stats = ?, engine_version = ?, base_version_id = ? WHERE id = ? AND status = 'processing'", JSON.stringify(stats), result.engineVersion || null, rev.liveId, version.id),
    moveStmt(db, version.id, "processing", "ready"),
    stmt(db, "UPDATE processing_jobs SET status = 'done', attempt_used = ?, updated_at = ? WHERE id = ?", attempt, t, job.id),
    // What the job used, for the budget guard: counted once, with the import (the guard above rolls back a second one).
    ...meterStmts(db, jobCost({ wallMs: state.wallMs, attempts: attempt, files: (result.files || []).length }))
  ];
  await db.batch(batch);

  // 3. After the commit: remove duplicate copies, everything else the job left, and the uploaded archive.
  const keep = new Set(Object.values(blobs).map((b) => b.key));
  const leftovers = (await jobObjects(app, owner, job.id)).filter((k) => !keep.has(k));
  const uploads = await all(db, "SELECT id, r2_key FROM uploads WHERE version_id = ? AND addition_id IS NULL", version.id);
  await deleteKeys(app.env, [...leftovers, ...uploads.map((u) => u.r2_key)]);
  // Its bytes are gone: the archive stops counting toward the creator's storage (creators/storage.js).
  await run(db, "UPDATE uploads SET status = 'aborted', updated_at = ? WHERE id IN (SELECT value FROM json_each(?))", now(), JSON.stringify(uploads.map((u) => u.id)));
  return stats;
}

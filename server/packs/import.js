// Importing a finished `process` job into a version (docs/packs.md): the files it keeps (accept.js: what the engine
// stored and the relay recorded identically, plus a thin ZIP's carried files). Each becomes an asset in the version's
// manifest (the live version's asset when it's the same file, revision.js), its bytes one stored original per owner
// and hash (a duplicate copy is deleted), its suggestions rows in asset_values. Then the uploaded archive and anything
// the job left over are deleted: the manifest is the record from here on (owner's decision, docs/decisions.md).
import { all, stmt, newId, now, guardStmt } from "../lib/db.js";
import { review } from "./review.js";
import { revisionOf } from "./revision.js";
import { keptFiles } from "./accept.js";
import { inUseSql } from "../creators/storage.js";
import { claimStmts, blobsByHash } from "../blobs/blobs.js";
import { jobObjects } from "./engine-client.js";
import { moveStmt } from "./versions.js";
import { deleteKeys } from "../storage/buckets.js";

const CHUNK = 300;
const chunks = (rows) => Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => JSON.stringify(rows.slice(i * CHUNK, (i + 1) * CHUNK)));
export async function importResult(app, version, job, state) {
  const { result, attempt } = state;
  const owner = version.owner_scope;
  const { kept, refused, carried, room } = await keptFiles(app, version, job, state);
  // For the automated review: how many of these the owner already had. As a revision of the live version
  // (revision.js): which files are the live version's files, and which folders its folders.
  const already = await blobsByHash(app.db, owner, [...new Set(kept.map((f) => f.sha256))]);
  const rev = await revisionOf(app.db, version, kept);

  // 1. One stored original per owner and hash: claim, then learn which key each hash ended up with. Carried files
  // already are stored originals: never claimed again (a row the sweep removed meanwhile must not come back pointing
  // at a deleted object), and the batch below goes ahead only while they all still exist.
  const fresh = kept.filter((f) => !f.carried);
  if (fresh.length) {
    await app.db.batch(claimStmts(app.db, owner, fresh.map((f) => ({ key: f.stored, sha256: f.sha256, size: f.size, crc32: f.crc32,
      format: f.format, facts: f.facts, engineVersion: result.engineVersion }))));
  }
  const blobs = await blobsByHash(app.db, owner, [...new Set(kept.map((f) => f.sha256))]);
  if (kept.some((f) => !blobs[f.sha256])) throw Object.assign(new Error("carried file missing"), { code: "missing_files" });
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
    ...(room ? [guardStmt(db, `${inUseSql("?1")} - ?2 + ?3 <= ?4`, owner, room.archive, room.bytes, room.quota)] : []),
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
    ...chunks(values).map((json) => stmt(db, `INSERT INTO asset_values (asset_id, field, value, origin, confidence, status, basis_blob_id, engine_version, updated_at)
      SELECT j.value->>'asset', j.value->>'field', j.value->>'value', j.value->>'origin', j.value->>'confidence', 'suggested', j.value->>'blob', ?, ?
      FROM json_each(?) j WHERE true
      ON CONFLICT (asset_id, field, value, origin) DO UPDATE SET confidence = excluded.confidence, basis_blob_id = excluded.basis_blob_id,
        engine_version = excluded.engine_version, updated_at = excluded.updated_at`, result.engineVersion || null, t, json)),
    stmt(db, "UPDATE pac_versions SET stats = ?, engine_version = ?, base_version_id = ? WHERE id = ? AND status = 'processing'", JSON.stringify(stats), result.engineVersion || null, rev.liveId, version.id),
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

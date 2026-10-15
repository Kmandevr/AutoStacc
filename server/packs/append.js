// Merging a finished addition into its version (additions.js; docs/packs.md, "Pac editor"): the files its job kept
// (accept.js, with the addition's own upload) go into the folder it named (the top if that folder is gone), any folders
// inside the archive under it, each a new asset (or the live version's asset when it's the same file, so a file added
// back keeps its id and values), with its suggestions. A name already taken in its folder is refused. The version's
// counts are taken again and its automated review gains this addition's flags. All of it in one batch that runs only
// while the addition is still checking and the version still ready; then the upload and leftovers are deleted.
import { all, run, stmt, newId, now, guardStmt, parseJson } from "../lib/db.js";
import { review, mergeReviews } from "./review.js";
import { revisionOf } from "./revision.js";
import { keptFiles } from "./accept.js";
import { claimOriginals, valuesOf, valueStmts } from "./import.js";
import { restatStmt } from "./stats.js";
import { inUseSql } from "../creators/storage.js";
import { LIMITS } from "../creators/policy.js";
import { blobsByHash } from "../blobs/blobs.js";
import { meterStmts, jobCost, capBytes } from "../usage/usage.js";
import { storedSql, storedBytes } from "../usage/storage.js";
import { jobObjects } from "./engine-client.js";
import { deleteKeys } from "../storage/buckets.js";

export async function appendResult(app, addition, job, state, upload) {
  const db = app.db;
  const { result, attempt } = state;
  const version = (await all(db, "SELECT * FROM pac_versions WHERE id = ?", addition.version_id))[0];
  if (!version || version.status !== "ready") throw Object.assign(new Error("version changed"), { code: "not_editable" });
  const owner = version.owner_scope;
  const { kept: all0, refused, room } = await keptFiles(app, version, job, state, { upload });

  // Where they go, and which names are already taken there (case aside, as Windows and macOS see them).
  const folders = await all(db, "SELECT id, parent_id, name FROM pac_folders WHERE version_id = ?", version.id);
  const target = folders.some((f) => f.id === addition.folder_id) ? addition.folder_id : null;
  const childOf = new Map(folders.map((f) => [`${f.parent_id || ""}/${f.name.toLowerCase()}`, f.id]));
  const made = [];
  const folderFor = (dir) => {
    let at = target;
    for (const part of dir ? dir.split("/") : []) {
      const k = `${at || ""}/${part.toLowerCase()}`;
      if (!childOf.has(k)) {
        const id = newId("fo");
        childOf.set(k, id);
        made.push({ id, parent: at, name: part, sort: folders.length + made.length });
      }
      at = childOf.get(k);
    }
    return at;
  };
  const taken = new Set((await all(db, "SELECT folder_id, lower(filename) AS n FROM pac_entries WHERE version_id = ?", version.id)).map((e) => `${e.folder_id || ""}/${e.n}`));
  const kept = [];
  for (const f of all0) {
    const dir = f.logical.includes("/") ? f.logical.slice(0, f.logical.lastIndexOf("/")) : "";
    const filename = f.logical.slice(f.logical.lastIndexOf("/") + 1);
    const folder = folderFor(dir);
    const k = `${folder || ""}/${filename.toLowerCase()}`;
    if (taken.has(k)) refused.push({ path: f.path, codes: ["duplicate_name"] });
    else (taken.add(k), kept.push({ ...f, folder, filename }));
  }
  // Only the folders the kept files need.
  const used = new Set(kept.map((f) => f.folder));
  for (let changed = true; changed;) {
    changed = false;
    for (const m of made) if (used.has(m.id) && m.parent && !used.has(m.parent)) (used.add(m.parent), (changed = true));
  }
  const newFolders = made.filter((m) => used.has(m.id));

  const already = await blobsByHash(db, owner, [...new Set(kept.map((f) => f.sha256))]);
  const here = new Set((await all(db, "SELECT asset_id FROM pac_entries WHERE version_id = ?", version.id)).map((r) => r.asset_id));
  if (here.size + kept.length > LIMITS.filesPerPacVersion) throw Object.assign(new Error("too many files"), { code: "too_many_files" });
  const cap = room ? await capBytes(db) : null;
  if (room) {
    const fresh = new Map(kept.filter((f) => !already[f.sha256]).map((f) => [f.sha256, f.size]));
    if ((await storedBytes(db)) - room.archive + [...fresh.values()].reduce((n, b) => n + b, 0) > cap) throw Object.assign(new Error("storage full"), { code: "storage_full" });
  }
  // Matched against the live version as the files will sit in this version (under the target folder).
  const byFolder = new Map(folders.map((f) => [f.id, f]));
  const pathOf = (id) => {
    const parts = [], seen = new Set();
    for (let f = byFolder.get(id); f && !seen.has(f.id); f = byFolder.get(f.parent_id)) (seen.add(f.id), parts.unshift(f.name));
    return parts.join("/");
  };
  const base = target ? `${pathOf(target)}/` : "";
  const rev = await revisionOf(db, version, kept.map((f) => ({ ...f, logical: base + f.logical })));
  const blobs = await claimOriginals(app, owner, kept, result.engineVersion);

  const t = now();
  const entries = [];
  const values = [];
  const maxSort = (await all(db, "SELECT COALESCE(MAX(sort), -1) AS n FROM pac_entries WHERE version_id = ?", version.id))[0].n;
  kept.forEach((f, i) => {
    // A file the live version has keeps its asset, unless this version already holds that asset.
    const liveAsset = rev.assetOf(i);
    const asset = liveAsset && !here.has(liveAsset) ? (here.add(liveAsset), liveAsset) : newId("as");
    entries.push({ asset, isNew: asset !== liveAsset, folder: f.folder, filename: f.filename, original: f.path, blob: blobs[f.sha256].id, sort: maxSort + 1 + i });
    values.push(...valuesOf(f, asset, blobs[f.sha256].id));
  });
  // Shares of the whole (mostly unknown formats, all duplicates) say nothing about a few files added to a Pac.
  const own0 = review({ result, kept, refused, existingHashes: 0 });
  const flags = own0.flags.filter((f) => f.code !== "mostly_unknown_formats");
  const own = { verdict: flags.length ? "hold" : "pass", flags };
  const stats = parseJson(version.stats, {});
  const added = { files: entries.length, bytes: kept.reduce((n, f) => n + f.size, 0), refused, review: own };
  const json = (rows) => JSON.stringify(rows);
  await db.batch([
    guardStmt(db, "EXISTS (SELECT 1 FROM pac_additions WHERE id = ? AND status = 'processing')", addition.id),
    guardStmt(db, "EXISTS (SELECT 1 FROM pac_versions WHERE id = ? AND status = 'ready')", version.id),
    ...(room ? [guardStmt(db, `${storedSql()} - ?1 <= ?2`, room.archive, cap)] : []),
    stmt(db, "UPDATE blobs SET delete_after = NULL WHERE id IN (SELECT j.value->>'blob' FROM json_each(?) j)", json(entries)),
    stmt(db, "INSERT INTO assets (id, pac_id, created_at) SELECT j.value->>'asset', ?, ? FROM json_each(?) j WHERE NOT EXISTS (SELECT 1 FROM assets a WHERE a.id = j.value->>'asset')", version.pac_id, t, json(entries)),
    stmt(db, `INSERT INTO pac_folders (id, version_id, parent_id, name, sort, original_path)
      SELECT j.value->>'id', ?, j.value->>'parent', j.value->>'name', j.value->>'sort', NULL FROM json_each(?) j`, version.id, json(newFolders)),
    stmt(db, `INSERT INTO pac_entries (version_id, asset_id, folder_id, filename, original_path, blob_id, sort, state)
      SELECT ?, j.value->>'asset', j.value->>'folder', j.value->>'filename', j.value->>'original', j.value->>'blob', j.value->>'sort', 'verified' FROM json_each(?) j`, version.id, json(entries)),
    // The creator's storage with these files in it (counted from the version's originals, creators/storage.js), less
    // the archive they came in, which goes next.
    ...(room ? [guardStmt(db, `${inUseSql("?1")} - ?2 <= ?3`, owner, room.archive, room.quota)] : []),
    ...valueStmts(db, values, result.engineVersion, t),
    stmt(db, "UPDATE pac_versions SET stats = json_set(COALESCE(stats, '{}'), '$.review', json(?), '$.refused', json(?)) WHERE id = ?",
      JSON.stringify(mergeReviews(stats.review, own)), JSON.stringify([...(stats.refused || []), ...refused].slice(-500)), version.id),
    restatStmt(db, version.id),
    stmt(db, "UPDATE pac_additions SET status = 'done', stats = ?, updated_at = ? WHERE id = ?", JSON.stringify(added), t, addition.id),
    stmt(db, "UPDATE processing_jobs SET status = 'done', attempt_used = ?, updated_at = ? WHERE id = ?", attempt, t, job.id),
    ...meterStmts(db, jobCost({ wallMs: state.wallMs, attempts: attempt, files: (result.files || []).length }))
  ]);
  // After the commit: duplicate copies, the job's leftovers and the upload go; the upload stops counting.
  const keep = new Set(Object.values(blobs).map((b) => b.key));
  const leftovers = (await jobObjects(app, owner, job.id)).filter((k) => !keep.has(k));
  await deleteKeys(app.env, [...leftovers, upload.r2_key]);
  await run(db, "UPDATE uploads SET status = 'aborted', updated_at = ? WHERE id = ?", now(), upload.id);
  return added;
}

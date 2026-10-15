// Shaping a checked, unpublished version as a file manager does (docs/packs.md, "Pac editor"): a new folder, files
// removed, a folder removed with everything in it, and a read me written in the builder that ships in the Pac as a
// text file (owner, 2026-10-15). Same rules as the other edits (edits.js): only while the version is ready, names
// unique per folder ignoring case; the version's counts are taken again after each. Removing a file from a version
// keeps its stored original until the retention sweep finds nothing uses it (blobs/sweep.js).
import { first, all, stmt, newId, now, randomToken } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { run, ownAssets, folderOf, cleanName } from "./edits.js";
import { restatStmt } from "./stats.js";
import { claimStmts, blobsByHash } from "../blobs/blobs.js";
import { crc32 } from "../files/legacy.js";
import { inUseSql, storageUsed } from "../creators/storage.js";
import { filesQuotaOf } from "../creators/policy.js";
import { storedSql, storedBytes } from "../usage/storage.js";
import { capBytes, STORAGE_FULL } from "../usage/usage.js";
import { guardStmt } from "../lib/db.js";
import { deleteKeys } from "../storage/buckets.js";

export const README_MAX_BYTES = 64 * 1024;

/** A new, empty folder under parentId (null: the top). → its id. */
export async function newFolder(app, version, { parentId = null, name }) {
  if (parentId !== null) await folderOf(app, version, parentId);
  const n = cleanName(name);
  const clash = await all(app.db, "SELECT 1 FROM pac_folders WHERE version_id = ? AND IFNULL(parent_id, '') = IFNULL(?, '') AND lower(name) = lower(?)", version.id, parentId, n);
  if (clash.length) fail(409, "name_taken", "A folder with that name is already there.");
  const id = newId("fo");
  await run(app, version, [
    stmt(app.db, "INSERT INTO pac_folders (id, version_id, parent_id, name, sort) SELECT ?, ?, ?, ?, COUNT(*) FROM pac_folders WHERE version_id = ?", id, version.id, parentId, n, version.id),
    restatStmt(app.db, version.id)
  ]);
  return id;
}

/** Takes files out of the version (their values stay with their assets, for a later version that brings them back). */
export async function removeFiles(app, version, { assetIds }) {
  const ids = await ownAssets(app, version, assetIds);
  await run(app, version, [
    stmt(app.db, "DELETE FROM pac_entries WHERE version_id = ? AND asset_id IN (SELECT value FROM json_each(?))", version.id, ids),
    restatStmt(app.db, version.id)
  ]);
}

/** Removes a folder with everything below it. → how many files went. */
export async function removeFolder(app, version, { folderId }) {
  await folderOf(app, version, folderId);
  const folders = await all(app.db, "SELECT id, parent_id FROM pac_folders WHERE version_id = ?", version.id);
  const gone = new Set([folderId]);
  for (let grew = true; grew;) {
    grew = false;
    for (const f of folders) if (f.parent_id && gone.has(f.parent_id) && !gone.has(f.id)) (gone.add(f.id), (grew = true));
  }
  const ids = JSON.stringify([...gone]);
  const files = (await first(app.db, "SELECT COUNT(*) AS n FROM pac_entries WHERE version_id = ? AND folder_id IN (SELECT value FROM json_each(?))", version.id, ids)).n;
  await run(app, version, [
    stmt(app.db, "DELETE FROM pac_entries WHERE version_id = ? AND folder_id IN (SELECT value FROM json_each(?))", version.id, ids),
    stmt(app.db, "DELETE FROM pac_folder_values WHERE version_id = ? AND folder_id IN (SELECT value FROM json_each(?))", version.id, ids),
    stmt(app.db, "DELETE FROM pac_folders WHERE version_id = ? AND id IN (SELECT value FROM json_each(?))", version.id, ids),
    restatStmt(app.db, version.id)
  ]);
  return files;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * A read me written in the builder, stored as a text file in the version (in folderId, null: the top), replacing the
 * file of that name if there is one (it keeps its asset). Plain text, written by the creator, so it needs no engine
 * job: it's stored as a checked original with its SHA-256 and CRC-32 like any other. → the asset id.
 */
export async function writeReadme(app, version, { text, filename = "Read me.txt", folderId = null }) {
  if (typeof text !== "string" || !text.trim()) fail(400, "invalid_text", "Write something first.");
  const name = cleanName(filename);
  if (!/\.txt$/i.test(name)) fail(400, "invalid_name", "A read me is a .txt file.");
  if (folderId !== null) await folderOf(app, version, folderId);
  const bytes = new TextEncoder().encode(text.replace(/\r?\n/g, "\r\n"));
  if (bytes.length > README_MAX_BYTES) fail(413, "too_long", "A read me can be up to 64 KB.");
  const owner = version.owner_scope;
  const creator = await first(app.db, "SELECT * FROM creators WHERE id = ?", owner);
  // A creator's storage and AutoStacc's cap hold for a read me too (checked again in the batch, for a race).
  if (creator && (await storedBytes(app.db)) + bytes.length > (await capBytes(app.db))) fail(409, "storage_full", STORAGE_FULL);
  if (creator && (await storageUsed(app.db, owner)) + bytes.length > filesQuotaOf(creator)) fail(409, "quota_exceeded", "That would go over your file storage.");
  const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
  const key = `blobs/${owner}/readme/${randomToken(12)}.txt`;
  await app.env.FILES.put(key, bytes, { httpMetadata: { contentType: "text/plain; charset=utf-8" }, sha256 });
  await app.db.batch(claimStmts(app.db, owner, [{ key, sha256, size: bytes.length, crc32: crc32(bytes), format: "text", facts: { writtenHere: true }, engineVersion: null }]));
  const blob = (await blobsByHash(app.db, owner, [sha256]))[sha256];
  if (blob.key !== key) await deleteKeys(app.env, [key]); // the same text was stored already
  const was = await first(app.db, "SELECT asset_id FROM pac_entries WHERE version_id = ? AND IFNULL(folder_id, '') = IFNULL(?, '') AND lower(filename) = lower(?)", version.id, folderId, name);
  const asset = was ? was.asset_id : newId("as");
  const t = now();
  await run(app, version, [
      stmt(app.db, "UPDATE blobs SET delete_after = NULL WHERE id = ?", blob.id),
      ...(was ? [stmt(app.db, "UPDATE pac_entries SET blob_id = ?, filename = ? WHERE version_id = ? AND asset_id = ?", blob.id, name, version.id, asset)]
        : [stmt(app.db, "INSERT INTO assets (id, pac_id, created_at) VALUES (?, ?, ?)", asset, version.pac_id, t),
          stmt(app.db, `INSERT INTO pac_entries (version_id, asset_id, folder_id, filename, original_path, blob_id, sort, state)
            SELECT ?, ?, ?, ?, NULL, ?, COALESCE(MAX(sort), -1) + 1, 'verified' FROM pac_entries WHERE version_id = ?`, version.id, asset, folderId, name, blob.id, version.id),
          // Its kind, as the engine says of any text file (classify.rs: the format decides the kind of all but audio).
          stmt(app.db, `INSERT INTO asset_values (asset_id, field, value, origin, confidence, status, basis_blob_id, updated_at)
            VALUES (?, 'kind', 'documents', 'rule', 0.95, 'suggested', ?, ?) ON CONFLICT DO NOTHING`, asset, blob.id, t)]),
      ...(creator ? [guardStmt(app.db, `${inUseSql("?1")} <= ?2`, owner, filesQuotaOf(creator)), guardStmt(app.db, `${storedSql()} <= ?1`, await capBytes(app.db))] : []),
      restatStmt(app.db, version.id)
  ]);
  return asset;
}

// Reviewing a ready version before it's published (docs/packs.md, Phase 4): the creator's own values on files (one or
// many at once), accepting or rejecting the engine's suggestions, folder defaults that every file below inherits
// (js/pack-resolve.js decides what each file ends up with), and moving or renaming files and folders. Only while the
// version is ready (each change is one batch that rolls back otherwise); a published version changes only through a
// new version. Values are checked against the vocabulary; names stay unique per folder, ignoring case.
import { all, stmt, now, guardStmt, isGuardFailure } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { assetValueOk } from "../discovery/vocabulary.js";
import resolver from "../../js/pack-resolve.js";

const { FIELDS } = resolver;

const READY = "EXISTS (SELECT 1 FROM pac_versions WHERE id = ? AND status = 'ready')";

async function run(app, version, statements) {
  try {
    await app.db.batch([guardStmt(app.db, READY, version.id), ...statements]);
  } catch (e) {
    if (isGuardFailure(e)) fail(409, "not_editable", "Only a checked version that isn't published yet can be changed.");
    if (/UNIQUE constraint failed: pac_entries/i.test(String(e.message))) fail(409, "name_taken", "A file with that name is already in that folder.");
    throw e;
  }
}

function field(name) {
  if (!FIELDS.includes(name)) fail(400, "invalid_field", "Unknown field.");
  return name;
}

// The given files, all of this version (else 404, like files that don't exist).
async function ownAssets(app, version, assetIds) {
  if (!Array.isArray(assetIds) || !assetIds.length || assetIds.length > 5000 || !assetIds.every((x) => typeof x === "string" && /^as_[a-z2-7]+$/.test(x))) {
    fail(400, "invalid_files", "Choose files of this version.");
  }
  const ids = [...new Set(assetIds)];
  const found = await all(app.db, "SELECT asset_id FROM pac_entries WHERE version_id = ? AND asset_id IN (SELECT value FROM json_each(?))", version.id, JSON.stringify(ids));
  if (found.length !== ids.length) fail(404, "not_found", "Some of those files aren't in this version.");
  return JSON.stringify(ids);
}

/** The creator's own value for a field on many files: a value, "" for none, or null to go back to inherited. */
export async function setValues(app, version, { assetIds, field: f, value, by }) {
  const name = field(f);
  if (value !== null && !assetValueOk(name, value)) fail(400, "invalid_value", "That value isn't in the vocabulary.");
  const ids = await ownAssets(app, version, assetIds);
  const t = now();
  await run(app, version, [
    stmt(app.db, "DELETE FROM asset_values WHERE field = ? AND origin = 'creator' AND asset_id IN (SELECT value FROM json_each(?))", name, ids),
    ...(value === null ? [] : [stmt(app.db, `INSERT INTO asset_values (asset_id, field, value, origin, confidence, status, set_by, updated_at)
      SELECT j.value, ?, ?, 'creator', NULL, 'accepted', ?, ? FROM json_each(?) j`, name, value, by, t, ids)])
  ]);
}

/** Accepts or rejects the engine's suggestion of `value` for a field on many files. */
export async function decideSuggestion(app, version, { assetIds, field: f, value, accept, by }) {
  const name = field(f);
  if (typeof value !== "string" || typeof accept !== "boolean") fail(400, "invalid_request", "Say which suggestion and whether to accept it.");
  const ids = await ownAssets(app, version, assetIds);
  await run(app, version, [stmt(app.db, `UPDATE asset_values SET status = ?, set_by = ?, updated_at = ? WHERE field = ? AND value = ? AND origin <> 'creator'
    AND asset_id IN (SELECT value FROM json_each(?))`, accept ? "accepted" : "rejected", by, now(), name, value, ids)]);
}

/** A folder's default for a field (inherited below it), or null to remove it. */
export async function setFolderValue(app, version, { folderId, field: f, value, by }) {
  const name = field(f);
  if (value !== null && !assetValueOk(name, value)) fail(400, "invalid_value", "That value isn't in the vocabulary.");
  await folderOf(app, version, folderId);
  await run(app, version, [
    stmt(app.db, "DELETE FROM pac_folder_values WHERE version_id = ? AND folder_id = ? AND field = ?", version.id, folderId, name),
    ...(value === null ? [] : [stmt(app.db, "INSERT INTO pac_folder_values (version_id, folder_id, field, value, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)",
      version.id, folderId, name, value, by, now())])
  ]);
}

async function folderOf(app, version, folderId) {
  if (typeof folderId !== "string") fail(400, "invalid_folder", "Choose a folder.");
  const f = (await all(app.db, "SELECT id, parent_id, name FROM pac_folders WHERE version_id = ? AND id = ?", version.id, folderId))[0];
  if (!f) fail(404, "not_found", "No such folder in this version.");
  return f;
}

/** Moves files into a folder of this version (null: the top). Their own values move with them; inherited ones change. */
export async function moveEntries(app, version, { assetIds, folderId }) {
  if (folderId !== null) await folderOf(app, version, folderId);
  const ids = await ownAssets(app, version, assetIds);
  await run(app, version, [stmt(app.db, "UPDATE pac_entries SET folder_id = ? WHERE version_id = ? AND asset_id IN (SELECT value FROM json_each(?))", folderId, version.id, ids)]);
}

const NAME = /^[^\\/:*?"<>|\u0000-\u001f]{1,120}$/;
const cleanName = (s) => {
  const n = typeof s === "string" ? s.normalize("NFC").trim() : "";
  if (!NAME.test(n) || /^\.+$/.test(n) || /[. ]$/.test(n)) fail(400, "invalid_name", "Use a plain name (no / \\ : * ? \" < > |).");
  return n;
};

export async function renameEntry(app, version, { assetId, filename }) {
  const ids = await ownAssets(app, version, [assetId]);
  await run(app, version, [stmt(app.db, "UPDATE pac_entries SET filename = ? WHERE version_id = ? AND asset_id IN (SELECT value FROM json_each(?))", cleanName(filename), version.id, ids)]);
}

export async function renameFolder(app, version, { folderId, name }) {
  const f = await folderOf(app, version, folderId);
  const n = cleanName(name);
  const clash = await all(app.db, "SELECT 1 FROM pac_folders WHERE version_id = ? AND IFNULL(parent_id, '') = IFNULL(?, '') AND lower(name) = lower(?) AND id <> ?",
    version.id, f.parent_id, n, f.id);
  if (clash.length) fail(409, "name_taken", "A folder with that name is already there.");
  await run(app, version, [stmt(app.db, "UPDATE pac_folders SET name = ? WHERE version_id = ? AND id = ?", n, version.id, f.id)]);
}

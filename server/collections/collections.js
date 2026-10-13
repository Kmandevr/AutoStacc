// Personal organization in Your Stacc (D1 collections, collection_items, asset_tags, saved_searches; docs/packs.md
// Phase 6b): a person's own collections of files, tags on files and saved searches. Everything is read and written by
// its owner's user id only. Items and tags point at item keys (server/entitlements/owned.js: a file's asset, the same
// across a Pac's versions, or the file's id), and are only ever added for files the person owns; once a file stops
// being theirs (a revision removed it and its 30 days passed, a refund) it is counted, never listed. Creators' own
// metadata is never touched. Deleted with the account and part of the data export.
import { all, first, run, stmt, newId, now } from "../lib/db.js";
import { fail } from "../lib/http.js";

export const LIMITS = { collections: 100, itemsPerCollection: 2000, tagsPerFile: 20, tagRows: 5000, searches: 50 };
const CHUNK = 400;

export function cleanName(v, what = "Name") {
  const n = typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim() : "";
  if (!n || n.length > 60 || /[\u0000-\u001f\u007f<>]/.test(n)) fail(400, "invalid_name", `${what}: 1 to 60 characters, no < or >.`);
  return n;
}

// Tags are short words: lowercase letters and numbers, with spaces, hyphens or underscores inside.
export function cleanTag(v) {
  const t = typeof v === "string" ? v.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ") : "";
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,29}$/u.test(t)) fail(400, "invalid_tag", "A tag is 1 to 30 letters or numbers (spaces, - and _ inside).");
  return t;
}

// A saved search is Your Stacc's own address query (/library?…): only its own filter names, short values.
const QUERY_KEYS = new Set(["view", "q", "project", "kind", "format", "collection", "tag"]);
export function cleanQuery(v) {
  const q = typeof v === "string" ? v.replace(/^\?/, "") : "";
  if (q.length > 400) fail(400, "invalid_query", "That search is too long to save.");
  const p = new URLSearchParams(q);
  const out = new URLSearchParams();
  for (const [k, val] of p) {
    if (!QUERY_KEYS.has(k) || val.length > 80 || out.has(k)) fail(400, "invalid_query", "That isn't a Your Stacc search.");
    if (val) out.set(k, val);
  }
  if (![...out.keys()].length) fail(400, "invalid_query", "Choose a filter or search first.");
  return out.toString();
}

export const listCollections = (db, userId) =>
  all(db, "SELECT id, name, created_at FROM collections WHERE user_id = ? ORDER BY lower(name)", userId);
export const getCollection = (db, userId, id) => first(db, "SELECT * FROM collections WHERE id = ? AND user_id = ?", id, userId);
export const itemsOf = (db, userId) => all(db, `SELECT i.collection_id, i.item_key, i.added_at FROM collection_items i
  JOIN collections c ON c.id = i.collection_id WHERE c.user_id = ? ORDER BY i.added_at`, userId);
export const tagsOf = (db, userId) => all(db, "SELECT item_key, tag, created_at FROM asset_tags WHERE user_id = ? ORDER BY tag", userId);
export const searchesOf = (db, userId) => all(db, "SELECT id, name, query, created_at FROM saved_searches WHERE user_id = ? ORDER BY lower(name)", userId);

// The cap is checked inside the insert, so parallel requests can't pass it; a name already used is a 409.
export async function createCollection(db, userId, name) {
  const id = newId("cl");
  const t = now();
  let res;
  try {
    res = await run(db, `INSERT INTO collections (id, user_id, name, created_at, updated_at)
      SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM collections WHERE user_id = ?) < ?`, id, userId, name, t, t, userId, LIMITS.collections);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) fail(409, "name_taken", "You already have a collection with that name.");
    throw e;
  }
  if (!res.meta.changes) fail(409, "limit_reached", `You can have up to ${LIMITS.collections} collections.`);
  return getCollection(db, userId, id);
}

export async function renameCollection(db, userId, id, name) {
  try {
    await run(db, "UPDATE collections SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?", name, now(), id, userId);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) fail(409, "name_taken", "You already have a collection with that name.");
    throw e;
  }
}

export const deleteCollection = (db, userId, id) => db.batch([
  stmt(db, "DELETE FROM collection_items WHERE collection_id IN (SELECT id FROM collections WHERE id = ? AND user_id = ?)", id, userId),
  stmt(db, "DELETE FROM collections WHERE id = ? AND user_id = ?", id, userId)
]);

/** Adds keys (already checked as owned) to a collection of this user, within the cap. Returns how many are in it. */
export async function addItems(db, collectionId, keys) {
  const t = now();
  const stmts = [];
  for (let i = 0; i < keys.length; i += CHUNK) {
    stmts.push(stmt(db, `INSERT OR IGNORE INTO collection_items (collection_id, item_key, added_at)
      SELECT ?, value, ? FROM json_each(?) WHERE (SELECT COUNT(*) FROM collection_items WHERE collection_id = ?) + ? <= ?`,
      collectionId, t, JSON.stringify(keys.slice(i, i + CHUNK)), collectionId, Math.min(CHUNK, keys.length - i), LIMITS.itemsPerCollection));
  }
  await db.batch(stmts);
  return (await first(db, "SELECT COUNT(*) AS n FROM collection_items WHERE collection_id = ?", collectionId)).n;
}

export const removeItems = (db, collectionId, keys) =>
  run(db, "DELETE FROM collection_items WHERE collection_id = ? AND item_key IN (SELECT value FROM json_each(?))", collectionId, JSON.stringify(keys));
// Items whose files the person no longer has (none of `owned`).
export const removeMissing = (db, collectionId, owned) =>
  run(db, "DELETE FROM collection_items WHERE collection_id = ? AND item_key NOT IN (SELECT value FROM json_each(?))", collectionId, JSON.stringify(owned));

/** Tags keys (already checked as owned): within the per-file and overall caps, checked in the insert. */
export async function addTag(db, userId, keys, tag) {
  const t = now();
  await db.batch([stmt(db, `INSERT OR IGNORE INTO asset_tags (user_id, item_key, tag, created_at)
    SELECT ?, j.value, ?, ? FROM json_each(?) j
    WHERE (SELECT COUNT(*) FROM asset_tags x WHERE x.user_id = ? AND x.item_key = j.value) < ?
      AND (SELECT COUNT(*) FROM asset_tags x WHERE x.user_id = ?) < ?`,
    userId, tag, t, JSON.stringify(keys), userId, LIMITS.tagsPerFile, userId, LIMITS.tagRows)]);
}
export const removeTag = (db, userId, keys, tag) =>
  run(db, "DELETE FROM asset_tags WHERE user_id = ? AND tag = ? AND item_key IN (SELECT value FROM json_each(?))", userId, tag, JSON.stringify(keys));

export async function saveSearch(db, userId, name, query) {
  const id = newId("ss");
  const res = await run(db, `INSERT INTO saved_searches (id, user_id, name, query, created_at)
    SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM saved_searches WHERE user_id = ?) < ?`, id, userId, name, query, now(), userId, LIMITS.searches);
  if (!res.meta.changes) fail(409, "limit_reached", `You can save up to ${LIMITS.searches} searches.`);
  return { id, name, query };
}
export const deleteSearch = (db, userId, id) => run(db, "DELETE FROM saved_searches WHERE id = ? AND user_id = ?", id, userId);

// For deleting an account (server/account/delete.js batches these with the rest).
export const eraseCollectionsStmts = (db, userId) => [
  stmt(db, "DELETE FROM collection_items WHERE collection_id IN (SELECT id FROM collections WHERE user_id = ?)", userId),
  stmt(db, "DELETE FROM collections WHERE user_id = ?", userId),
  stmt(db, "DELETE FROM asset_tags WHERE user_id = ?", userId),
  stmt(db, "DELETE FROM saved_searches WHERE user_id = ?", userId)
];

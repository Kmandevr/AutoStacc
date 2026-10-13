// Your Stacc's personal organization API (collections.js; docs/library.md). Signed-in people only (401 otherwise), each
// reading and changing their own rows only: another person's collection or search is 404, and a file id that isn't
// theirs right now is 404 too (server/entitlements/owned.js), so nothing here reveals what anyone else owns.
//   GET    /api/collections                        { collections: [{ id, name, items: [key], missing }], tags: { key: [tag] }, searches }
//   POST   /api/collections                        { name }                      a new collection
//   PATCH  /api/collections/:id                    { name }
//   DELETE /api/collections/:id
//   POST   /api/collections/:id/items              { fileIds }                   add files
//   POST   /api/collections/:id/items/remove       { fileIds } or { missing: true }  take files out, or the ones no longer yours
//   POST   /api/tags                               { fileIds, tag }              tag files
//   POST   /api/tags/remove                        { fileIds, tag }
//   POST   /api/saved-searches                     { name, query }               query: a /library address query
//   DELETE /api/saved-searches/:id
import { json, fail, readJson, id } from "../lib/http.js";
import { requireFeature } from "../lib/features.js";
import { requireAccess } from "../entitlements/access.js";
import { ownedFiles } from "../entitlements/owned.js";
import { limit } from "../lib/ratelimit.js";
import * as C from "./collections.js";

const FILE_ID = /^pf_[a-z2-7]+$/;

async function person(app, { write = false } = {}) {
  requireFeature(app, "library.collections");
  const access = await requireAccess(app);
  if (!access.user) fail(401, "unauthenticated", "Log in to organize Your Stacc.");
  if (write) await limit(app, `collections:${access.user.id}`, 120, 60);
  // The account's own purchases only: a guest receipt's key in this browser (maybe someone else's) doesn't count here.
  return { ...access, guestOrderIds: [] };
}

// The item keys of these file ids, all of which must be this person's right now.
async function keysOf(app, access, fileIds) {
  if (!Array.isArray(fileIds) || !fileIds.length || fileIds.length > C.LIMITS.itemsPerCollection || !fileIds.every((f) => typeof f === "string" && FILE_ID.test(f))) {
    fail(400, "invalid_files", "Choose files from Your Stacc.");
  }
  const owned = new Map((await ownedFiles(app.db, access)).map((f) => [f.id, f.key]));
  if (!fileIds.every((f) => owned.has(f))) fail(404, "not_found", "Some of those files aren't in Your Stacc.");
  return [...new Set(fileIds.map((f) => owned.get(f)))];
}

async function collectionOf(app, access, cid) {
  const c = await C.getCollection(app.db, access.user.id, id(cid, "collectionId"));
  if (!c) fail(404, "not_found", "No such collection.");
  return c;
}

async function overview(app) {
  const access = await person(app);
  const uid = access.user.id;
  const [owned, collections, items, tags, searches] = await Promise.all([ownedFiles(app.db, access), C.listCollections(app.db, uid),
    C.itemsOf(app.db, uid), C.tagsOf(app.db, uid), C.searchesOf(app.db, uid)]);
  const mine = new Set(owned.map((f) => f.key));
  const byCollection = Object.groupBy(items, (i) => i.collection_id);
  const tagged = {};
  for (const t of tags) if (mine.has(t.item_key)) (tagged[t.item_key] = tagged[t.item_key] || []).push(t.tag);
  return json({
    collections: collections.map((c) => {
      const list = byCollection[c.id] || [];
      return { id: c.id, name: c.name, createdAt: c.created_at, items: list.filter((i) => mine.has(i.item_key)).map((i) => i.item_key),
        missing: list.filter((i) => !mine.has(i.item_key)).length };
    }),
    tags: tagged,
    searches: searches.map((s) => ({ id: s.id, name: s.name, query: s.query }))
  });
}

export const routes = [
  ["GET", "/api/collections", overview],
  ["POST", "/api/collections", async (app) => {
    const access = await person(app, { write: true });
    const body = await readJson(app.request);
    const c = await C.createCollection(app.db, access.user.id, C.cleanName(body.name, "A collection's name"));
    return json({ collection: { id: c.id, name: c.name, createdAt: c.created_at, items: [], missing: 0 } }, 201);
  }],
  ["PATCH", "/api/collections/:collectionId", async (app, { collectionId }) => {
    const access = await person(app, { write: true });
    const c = await collectionOf(app, access, collectionId);
    const body = await readJson(app.request);
    await C.renameCollection(app.db, access.user.id, c.id, C.cleanName(body.name, "A collection's name"));
    return json({ ok: true });
  }],
  ["DELETE", "/api/collections/:collectionId", async (app, { collectionId }) => {
    const access = await person(app, { write: true });
    const c = await collectionOf(app, access, collectionId);
    await C.deleteCollection(app.db, access.user.id, c.id);
    return json({ ok: true });
  }],
  ["POST", "/api/collections/:collectionId/items", async (app, { collectionId }) => {
    const access = await person(app, { write: true });
    const c = await collectionOf(app, access, collectionId);
    const body = await readJson(app.request, 256 * 1024);
    const keys = await keysOf(app, access, body.fileIds);
    const count = await C.addItems(app.db, c.id, keys);
    return json({ ok: true, count });
  }],
  ["POST", "/api/collections/:collectionId/items/remove", async (app, { collectionId }) => {
    const access = await person(app, { write: true });
    const c = await collectionOf(app, access, collectionId);
    const body = await readJson(app.request, 256 * 1024);
    if (body.missing === true) await C.removeMissing(app.db, c.id, (await ownedFiles(app.db, access)).map((f) => f.key));
    else await C.removeItems(app.db, c.id, await keysOf(app, access, body.fileIds));
    return json({ ok: true });
  }],
  ["POST", "/api/tags", async (app) => {
    const access = await person(app, { write: true });
    const body = await readJson(app.request, 256 * 1024);
    const tag = C.cleanTag(body.tag);
    await C.addTag(app.db, access.user.id, await keysOf(app, access, body.fileIds), tag);
    return json({ ok: true, tag });
  }],
  ["POST", "/api/tags/remove", async (app) => {
    const access = await person(app, { write: true });
    const body = await readJson(app.request, 256 * 1024);
    await C.removeTag(app.db, access.user.id, await keysOf(app, access, body.fileIds), C.cleanTag(body.tag));
    return json({ ok: true });
  }],
  ["POST", "/api/saved-searches", async (app) => {
    const access = await person(app, { write: true });
    const body = await readJson(app.request);
    return json({ search: await C.saveSearch(app.db, access.user.id, C.cleanName(body.name, "A search's name"), C.cleanQuery(body.query)) }, 201);
  }],
  ["DELETE", "/api/saved-searches/:searchId", async (app, { searchId }) => {
    const access = await person(app, { write: true });
    await C.deleteSearch(app.db, access.user.id, id(searchId, "searchId"));
    return json({ ok: true });
  }]
];

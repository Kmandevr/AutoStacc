// Publishing a ready version: its manifest becomes the files for this Pac in every product that sells the Pac (server/files/publish-rows.js keeps
// unchanged files' ids and retires the rest), the previous live version is superseded and the Pac is free for its next
// version, all in one D1 batch (all or nothing) that runs only while the version is still ready.
import { all, stmt, newId, now, parseJson, guardStmt } from "../lib/db.js";
import { publishStmts } from "../files/publish-rows.js";
import { releaseDraftStmt } from "./versions.js";
import { productsWithPac } from "../catalog/products.js";

// A suggested kind becomes the file's kind (how Your Stacc groups it) from this confidence; below it, the file's format
// decides as before. Creators' own values (Phase 4) will always win.
const KIND_FROM = 0.5;

function folderPaths(folders) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path = (id) => {
    const f = byId.get(id);
    return f ? (f.parent_id ? `${path(f.parent_id)}/${f.name}` : f.name) : "";
  };
  return (id) => (id ? path(id) : "");
}

/** What customers get for each entry of a version: names, folders, kind and a snapshot of the details. */
export async function publishedEntries(db, versionId) {
  const [entries, folders, values] = await Promise.all([
    all(db, `SELECT e.asset_id, e.blob_id, e.filename, e.folder_id, e.sort, b.size_bytes, b.format, b.sha256, b.facts
      FROM pac_entries e JOIN blobs b ON b.id = e.blob_id WHERE e.version_id = ? AND e.state = 'verified' ORDER BY e.sort`, versionId),
    all(db, "SELECT id, parent_id, name FROM pac_folders WHERE version_id = ?", versionId),
    all(db, `SELECT v.asset_id, v.field, v.value, v.confidence FROM asset_values v JOIN pac_entries e ON e.asset_id = v.asset_id
      WHERE e.version_id = ? AND v.status <> 'rejected'`, versionId)
  ]);
  const pathOf = folderPaths(folders);
  const byAsset = new Map();
  for (const v of values) (byAsset.get(v.asset_id) || byAsset.set(v.asset_id, []).get(v.asset_id)).push(v);
  return entries.map((e) => {
    const vals = byAsset.get(e.asset_id) || [];
    const kind = vals.filter((v) => v.field === "kind" && v.confidence >= KIND_FROM).sort((a, b) => b.confidence - a.confidence)[0];
    const facts = parseJson(e.facts, {});
    return {
      fileId: newId("pf"), assetId: e.asset_id, blobId: e.blob_id, filename: e.filename, folderPath: pathOf(e.folder_id), sort: e.sort,
      size: e.size_bytes, kind: kind ? kind.value : "",
      meta: {
        format: e.format, sha256: e.sha256,
        facts: { durationMs: facts.durationMs, sampleRate: facts.sampleRate, bitDepth: facts.bitDepth, channels: facts.channels },
        suggested: vals.map((v) => ({ field: v.field, value: v.value, confidence: v.confidence }))
      }
    };
  });
}

export async function publishVersion(app, version) {
  const db = app.db;
  const t = now();
  const entries = await publishedEntries(db, version.id);
  // A Pac is content and products sell it: every product that includes it gets the same files (each its own rows).
  const products = await productsWithPac(db, version.pac_id);
  await db.batch([
    // Only while the version is still ready (not discarded or published meanwhile); otherwise all of it rolls back.
    guardStmt(db, "EXISTS (SELECT 1 FROM pac_versions WHERE id = ? AND status = 'ready')", version.id),
    stmt(db, "UPDATE pac_versions SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND status = 'ready'", t, t, version.id),
    ...products.flatMap((p) => publishStmts(db, { productId: p.id, pacId: version.pac_id, versionId: version.id, entries: entries.map((e) => ({ ...e, fileId: newId("pf") })), t })),
    stmt(db, `UPDATE pac_versions SET status = 'superseded', updated_at = ? WHERE status = 'published' AND pac_id = ? AND id <> ?`, t, version.pac_id, version.id),
    stmt(db, "UPDATE pacs SET live_version_id = ?, updated_at = ? WHERE id = ?", version.id, t, version.pac_id),
    releaseDraftStmt(db, version.pac_id, version.id)
  ]);
  return { files: entries.length };
}

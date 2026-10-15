// Publishing a ready version: its manifest becomes the files for this Pac in every product that sells the Pac (server/files/publish-rows.js keeps
// unchanged files' ids and retires the rest), the previous live version is superseded and the Pac is free for its next
// version, all in one D1 batch (all or nothing) that runs only while the version is still ready (or held for review).
// Then each product's contents (server/discovery/contents.js) are worked out again from what is now published.
import { stmt, first, newId, now, guardStmt } from "../lib/db.js";
import { loadManifest } from "./manifest.js";
import { publishStmts } from "../files/publish-rows.js";
import { releaseDraftStmt } from "./versions.js";
import { productsWithPac } from "../catalog/products.js";
import { refreshContents } from "../discovery/contents.js";

// The file's kind (how Your Stacc groups it): its resolved kind (the creator's, a folder's, or an accepted or sure
// suggestion); failing that, the engine's best guess from this confidence, only for grouping, never shown as a fact.
const KIND_FROM = 0.5;

/** What customers get for each file of a version: name, folder, kind, and a snapshot of its resolved details. */
export async function publishedEntries(db, versionId) {
  const { files } = await loadManifest(db, versionId);
  return files.map((f) => {
    const guess = f.values.filter((v) => v.field === "kind" && v.origin !== "creator" && v.status !== "rejected" && v.confidence >= KIND_FROM)
      .sort((a, b) => b.confidence - a.confidence)[0];
    return {
      fileId: newId("pf"), assetId: f.assetId, blobId: f.blobId, filename: f.filename, folderPath: f.folderPath, sort: f.sort, size: f.sizeBytes,
      kind: f.resolved.kind ? f.resolved.kind.value : guess ? guess.value : "",
      meta: {
        format: f.format, sha256: f.sha256,
        facts: { durationMs: f.facts.durationMs, sampleRate: f.facts.sampleRate, bitDepth: f.facts.bitDepth, channels: f.facts.channels,
          ...(Array.isArray(f.facts.peaks) ? { peaks: f.facts.peaks } : {}) },
        values: Object.fromEntries(Object.entries(f.resolved).map(([k, r]) => [k, { value: r.value, source: r.source }]))
      }
    };
  });
}

/** reviewedBy: the admin who approved a held version (or published over its flags), else null. */
// A read me's text, kept with its published details so customers can read it on the product page and in Your Stacc
// without a download: one written in the Pac editor (tree-edits.js marks its stored original), at the top of the Pac.
// A read me that only came inside an upload stays in the download: it may hold what's meant for buyers only.
const README = /^read[ _-]?me\b.*\.txt$/i;
const README_TEXT = 64 * 1024;
async function withReadme(app, entries) {
  for (const e of entries) {
    if (e.folderPath || !README.test(e.filename) || e.meta.format !== "text" || e.size > README_TEXT) continue;
    const blob = await first(app.db, "SELECT r2_key FROM blobs WHERE id = ? AND json_extract(facts, '$.writtenHere') = 1", e.blobId);
    const obj = blob && (await app.env.FILES.get(blob.r2_key));
    if (obj) e.meta.readme = (await obj.text()).replace(/\r\n/g, "\n");
  }
  return entries;
}

export async function publishVersion(app, version, { reviewedBy = null } = {}) {
  const db = app.db;
  const t = now();
  const entries = await withReadme(app, await publishedEntries(db, version.id));
  // A Pac is content and products sell it: every product that includes it gets the same files (each its own rows).
  const products = await productsWithPac(db, version.pac_id);
  await db.batch([
    // Only while the version is still ready (not discarded or published meanwhile); otherwise all of it rolls back.
    // Unchanged since its stats were read (a removal or addition rewrites them): what was reviewed is what goes live.
    guardStmt(db, "EXISTS (SELECT 1 FROM pac_versions WHERE id = ? AND status IN ('ready', 'in_review') AND stats IS ?)", version.id, version.stats),
    stmt(db, "UPDATE pac_versions SET status = 'published', published_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ? AND status IN ('ready', 'in_review')",
      t, reviewedBy || null, t, version.id),
    ...products.flatMap((p) => publishStmts(db, { productId: p.id, pacId: version.pac_id, versionId: version.id, entries: entries.map((e) => ({ ...e, fileId: newId("pf") })), t })),
    stmt(db, `UPDATE pac_versions SET status = 'superseded', updated_at = ? WHERE status = 'published' AND pac_id = ? AND id <> ?`, t, version.pac_id, version.id),
    stmt(db, "UPDATE pacs SET live_version_id = ?, updated_at = ? WHERE id = ?", version.id, t, version.pac_id),
    releaseDraftStmt(db, version.pac_id, version.id)
  ]);
  // What each product now contains, for its page and the store's filters (after the commit: only published files count).
  // A failure here never undoes or fails the publish (already committed): it's logged, and the next publish, admin file
  // change or daily sweep (server/maintenance/) works the contents out again.
  for (const p of products) {
    await refreshContents(app, p.id).catch((e) => console.error(`contents ${p.id}:`, e && e.message));
  }
  return { files: entries.length };
}

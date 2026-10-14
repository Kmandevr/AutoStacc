// Retention sweep of stored originals (part of the daily sweep, server/maintenance/sweep.js). A blob is in use while an
// active product file or an unfinished or live version's manifest points to it. An unused one gets a day's grace
// (delete_after), so a version being imported right now can still claim it; after that its object and row go. Newly
// claimed blobs start with that day already set and are kept once their import commits (claimStmts).
import { all, stmt } from "../lib/db.js";
import { deleteKeys } from "../storage/buckets.js";
import { variantKey } from "../downloads/variants.js";

const IN_USE = `(EXISTS (SELECT 1 FROM product_files f WHERE f.blob_id = blobs.id AND f.active = 1)
  OR EXISTS (SELECT 1 FROM pac_entries e JOIN pac_versions v ON v.id = e.version_id
    WHERE e.blob_id = blobs.id AND v.status IN ('draft', 'uploading', 'processing', 'ready', 'in_review', 'published')))`;

/** Marks newly unused blobs, un-marks reused ones, and deletes up to `limit` whose grace has passed. */
export async function sweepBlobs(app, { nowMs = Date.now(), limit = 500 } = {}) {
  const t = new Date(nowMs).toISOString();
  const grace = new Date(nowMs + 86400000).toISOString();
  await app.db.batch([
    stmt(app.db, `UPDATE blobs SET delete_after = ? WHERE delete_after IS NULL AND NOT ${IN_USE}`, grace),
    stmt(app.db, `UPDATE blobs SET delete_after = NULL WHERE delete_after IS NOT NULL AND ${IN_USE}`)
  ]);
  const due = await all(app.db, `SELECT id FROM blobs WHERE delete_after IS NOT NULL AND delete_after < ? AND NOT ${IN_USE} LIMIT ?`, t, limit);
  if (!due.length) return 0;
  // Rows first (only those still unused), then their objects: an import racing this can at worst fail and be retried,
  // never end up pointing at an object that is gone.
  // Old versions' manifests (superseded, discarded, failed) let go of them first (pac_entries refers to blobs).
  const ids = JSON.stringify(due.map((b) => b.id));
  const [, deleted] = await app.db.batch([
    stmt(app.db, `UPDATE pac_entries SET blob_id = NULL WHERE blob_id IN (SELECT value FROM json_each(?))
      AND version_id IN (SELECT id FROM pac_versions WHERE status IN ('superseded', 'discarded', 'failed'))`, ids),
    stmt(app.db, `DELETE FROM blobs WHERE id IN (SELECT value FROM json_each(?)) AND NOT ${IN_USE} RETURNING id, r2_key, deflate_bytes`, ids)
  ]);
  const gone = deleted.results || [];
  // With each original, its deflated copy for ZIPs if it had one (downloads/variants.js).
  await deleteKeys(app.env, [...gone.map((b) => b.r2_key), ...gone.filter((b) => b.deflate_bytes).map((b) => variantKey(b.id))]);
  return gone.length;
}


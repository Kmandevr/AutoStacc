// Paid files of products (D1 product_files): which may be delivered and their lifecycle. A file is uploaded as
// pending or published (the admin's own uploads publish at once), can be rejected or deleted, and only a published,
// active file ever reaches a customer: downloads, the library and test-purchase checks all read DELIVERABLE.
// This is the "upload → check → publish" path creator uploads will use; a scanner would sit between pending and published.
import { all, first, run, now } from "../lib/db.js";
import { blobKey } from "../blobs/blobs.js";

export const DELIVERABLE = "active = 1 AND status = 'published'";
// The same rule for a query that names product_files with an alias ("f" → "f.active = 1 AND f.status = 'published'").
export const deliverableAs = (alias) => `${alias}.active = 1 AND ${alias}.status = 'published'`;

// A file a newer version removed or replaced (retired_at) stays downloadable for 30 days, and only to people whose
// access began before it was retired (docs/packs.md H8, owner's decision); everyone else gets the current files only.
export const RETIRED_KEEP_DAYS = 30;
export function stillDelivered(file, grantedAt, nowMs = Date.now()) {
  if (!file.retired_at) return true;
  return Boolean(grantedAt) && grantedAt < file.retired_at && Date.parse(file.retired_at) > nowMs - RETIRED_KEEP_DAYS * 86400000;
}
export const STATUSES = ["pending", "published", "rejected", "deleted"];

export const getDeliverableFile = (db, fileId) => first(db, `SELECT * FROM product_files WHERE id = ? AND ${DELIVERABLE}`, fileId);

export const deliverableFiles = (db, productIds) => (productIds.length
  ? all(db, `SELECT id, product_id, filename, label, content_type, size_bytes, pac_id, kind, folder_path, retired_at, blob_id, asset_id FROM product_files
      WHERE ${DELIVERABLE} AND product_id IN (${productIds.map(() => "?").join(",")}) ORDER BY sort, filename`, ...productIds)
  : Promise.resolve([]));

// What a buyer would download per product (published, active files only): { productId: { files, bytes } }.
export const downloadSizes = async (db, productIds) => (productIds.length
  ? Object.fromEntries((await all(db, `SELECT product_id, COUNT(*) AS files, COALESCE(SUM(size_bytes), 0) AS bytes FROM product_files
      WHERE ${DELIVERABLE} AND product_id IN (${productIds.map(() => "?").join(",")}) GROUP BY product_id`, ...productIds))
      .map((r) => [r.product_id, { files: r.files, bytes: r.bytes }]))
  : {});

export const countDeliverable = async (db, productId) => (await first(db, `SELECT COUNT(*) AS n FROM product_files WHERE product_id = ? AND ${DELIVERABLE}`, productId)).n;

// Files counted against a product's limit: everything not rejected or deleted.
export const countKept = async (db, productId) =>
  (await first(db, "SELECT COUNT(*) AS n FROM product_files WHERE product_id = ? AND active = 1 AND status IN ('pending', 'published')", productId)).n;

// Moves a file to a new state. Deleted and rejected files stop being active, and their bytes go a day later
// (retention.js, from removed_at).
export const setStatus = (db, fileId, status, note = null) =>
  run(db, `UPDATE product_files SET status = ?, status_note = ?, status_at = ?, active = CASE WHEN ? IN ('rejected', 'deleted') THEN 0 ELSE active END,
    removed_at = CASE WHEN ? IN ('rejected', 'deleted') AND active = 1 THEN ? ELSE removed_at END
    WHERE id = ? AND status <> 'deleted'`, status, note, now(), status, status, now(), fileId);

/** Stops a file reaching anyone (an admin's removal or replacement); its bytes go a day later (retention.js). */
export const deactivate = (db, fileId) => run(db, "UPDATE product_files SET active = 0, removed_at = ? WHERE id = ? AND active = 1", now(), fileId);

// A product made in the Studio is only on sale while it has a file a buyer could download. Called after any change to a
// file's state: a product whose last deliverable file was rejected or removed goes back to draft instead of selling nothing.
export const unpublishEmptyStudioProducts = (db) =>
  run(db, `UPDATE products SET published = 0, updated_at = ? WHERE source = 'studio' AND published = 1
    AND NOT EXISTS (SELECT 1 FROM product_files f WHERE f.product_id = products.id AND f.active = 1 AND f.status = 'published')`, now());

// Where a file's bytes are: its stored original's key for files published from a pack version (their own r2_key is a
// placeholder, db/migrations/0015_pack_publish.sql), else its own key. Every download goes through here.
export const storageKeyOf = async (db, file) => (file.blob_id ? blobKey(db, file.blob_id) : file.r2_key);

// Retention sweep: files retired longer than RETIRED_KEEP_DAYS ago reach nobody any more, so they stop being active
// (their stored original is then unused and the blob sweep removes it). Returns how many.
export async function deactivateExpiredRetired(db, nowMs = Date.now()) {
  const cutoff = new Date(nowMs - RETIRED_KEEP_DAYS * 86400000).toISOString();
  const res = await run(db, "UPDATE product_files SET active = 0, status_at = ?, removed_at = ? WHERE active = 1 AND retired_at IS NOT NULL AND retired_at < ?", now(), now(), cutoff);
  return res.meta.changes || 0;
}

// Paid files of products (D1 product_files): which may be delivered and their lifecycle. A file is uploaded as
// pending or published (the admin's own uploads publish at once), can be rejected or deleted, and only a published,
// active file ever reaches a customer: downloads, the library and test-purchase checks all read DELIVERABLE.
// This is the "upload → check → publish" path creator uploads will use; a scanner would sit between pending and published.
import { all, first, run, now } from "../lib/db.js";

export const DELIVERABLE = "active = 1 AND status = 'published'";
export const STATUSES = ["pending", "published", "rejected", "deleted"];

export const getDeliverableFile = (db, fileId) => first(db, `SELECT * FROM product_files WHERE id = ? AND ${DELIVERABLE}`, fileId);

export const deliverableFiles = (db, productIds) => (productIds.length
  ? all(db, `SELECT id, product_id, filename, label, content_type, size_bytes, pac_id, kind FROM product_files
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

// Moves a file to a new state. Deleted and rejected files stop being active; nothing is removed from storage.
export const setStatus = (db, fileId, status, note = null) =>
  run(db, `UPDATE product_files SET status = ?, status_note = ?, status_at = ?, active = CASE WHEN ? IN ('rejected', 'deleted') THEN 0 ELSE active END
    WHERE id = ? AND status <> 'deleted'`, status, note, now(), status, fileId);

// A product made in the Studio is only on sale while it has a file a buyer could download. Called after any change to a
// file's state: a product whose last deliverable file was rejected or removed goes back to draft instead of selling nothing.
export const unpublishEmptyStudioProducts = (db) =>
  run(db, `UPDATE products SET published = 0, updated_at = ? WHERE source = 'studio' AND published = 1
    AND NOT EXISTS (SELECT 1 FROM product_files f WHERE f.product_id = products.id AND f.active = 1 AND f.status = 'published')`, now());

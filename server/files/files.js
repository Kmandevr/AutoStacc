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

export const countDeliverable = async (db, productId) => (await first(db, `SELECT COUNT(*) AS n FROM product_files WHERE product_id = ? AND ${DELIVERABLE}`, productId)).n;

// Files counted against a product's limit: everything not rejected or deleted.
export const countKept = async (db, productId) =>
  (await first(db, "SELECT COUNT(*) AS n FROM product_files WHERE product_id = ? AND active = 1 AND status IN ('pending', 'published')", productId)).n;

// Moves a file to a new state. Deleted and rejected files stop being active; nothing is removed from storage.
export const setStatus = (db, fileId, status, note = null) =>
  run(db, `UPDATE product_files SET status = ?, status_note = ?, status_at = ?, active = CASE WHEN ? IN ('rejected', 'deleted') THEN 0 ELSE active END
    WHERE id = ? AND status <> 'deleted'`, status, note, now(), status, fileId);

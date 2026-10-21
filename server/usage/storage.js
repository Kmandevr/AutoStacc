// All the storage AutoStacc's R2 holds, for the global cap (owner: creators' uploads stop before the account's free
// 10 GB is passed; usage.js). Counted live from what the database knows is stored, each object once: stored originals
// (until the sweep deletes them), delivered files that aren't stored originals (single uploads, catalog files; removed
// ones until files/retention.js deletes their bytes), archives on their way in, and creators' site images. It reads
// other modules' tables, like creators/storage.js does, because it must count inside their inserts. Not counted:
// a product's own preview clip (the PREVIEWS bucket, one per product; Pacs' clips are counted). storedSql() is the expression,
// for use inside the insert or batch that takes the room, so two uploads at once can't both squeeze under.
// paidCapBytes() is the room creators' active paid plans add to the cap (owner 2026-10-21, #142).
import { first, all } from "../lib/db.js";
import { includedQuotaOf } from "../creators/policy.js";

export const storedSql = () => `((SELECT COALESCE(SUM(size_bytes + COALESCE(deflate_bytes, 0)), 0) FROM blobs)
  + (SELECT COALESCE(SUM(size_bytes), 0) FROM product_files WHERE blob_id IS NULL AND json_extract(COALESCE(meta, '{}'), '$.purgedAt') IS NULL)
  + (SELECT COALESCE(SUM(size_bytes), 0) FROM uploads WHERE status IN ('open', 'complete'))
  + (SELECT COALESCE(SUM(size_bytes), 0) FROM site_assets WHERE status = 'active')
  + (SELECT COALESCE(SUM(size_bytes), 0) FROM pac_previews))`;

export const storedBytes = async (db) => (await first(db, `SELECT ${storedSql()} AS n`)).n;

/** What active paid plans hold above each creator's free storage, in bytes: the cap grows by exactly this (#142).
 * Only the part above free storage counts, since free storage is already expected inside the owner's base cap.
 * First-party creators (source 'catalog') have no paid storage. Past-due and cancelled plans add nothing. */
export async function paidCapBytes(db) {
  const rows = await all(db, `SELECT p.cap_bytes, c.source, c.storage_quota_bytes, c.files_quota_bytes
    FROM storage_plans p JOIN creators c ON c.id = p.creator_id WHERE p.status = 'active' AND c.source <> 'catalog'`);
  return rows.reduce((sum, r) => sum + Math.max(0, Number(r.cap_bytes) - includedQuotaOf(r)), 0);
}

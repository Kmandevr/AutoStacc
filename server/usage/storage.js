// All the storage AutoStacc's R2 holds, for the global cap (owner: creators' uploads stop before the account's free
// 10 GB is passed; usage.js). Counted live from what the database knows is stored, each object once: stored originals
// (until the sweep deletes them), delivered files that aren't stored originals (single uploads, catalog files; removed
// ones until files/retention.js deletes their bytes), archives on their way in, and creators' site images. It reads
// other modules' tables, like creators/storage.js does, because it must count inside their inserts. Not counted:
// preview clips (the PREVIEWS bucket, small and one per product). storedSql() is the expression,
// for use inside the insert or batch that takes the room, so two uploads at once can't both squeeze under.
import { first } from "../lib/db.js";

export const storedSql = () => `((SELECT COALESCE(SUM(size_bytes + COALESCE(deflate_bytes, 0)), 0) FROM blobs)
  + (SELECT COALESCE(SUM(size_bytes), 0) FROM product_files WHERE blob_id IS NULL AND json_extract(COALESCE(meta, '{}'), '$.purgedAt') IS NULL)
  + (SELECT COALESCE(SUM(size_bytes), 0) FROM uploads WHERE status IN ('open', 'complete'))
  + (SELECT COALESCE(SUM(size_bytes), 0) FROM site_assets WHERE status = 'active'))`;

export const storedBytes = async (db) => (await first(db, `SELECT ${storedSql()} AS n`)).n;

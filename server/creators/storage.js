// A creator's file storage in use, the one measure both kinds of upload check against the creator's quota
// (filesQuotaOf, policy.js): their delivered files (not yet retired) and removed files whose bytes aren't deleted yet
// (files/retention.js, a day); every archive on its way in (uploaded or uploading, not yet unpacked: import and append
// mark it aborted once its bytes are gone) for a version not yet published, discarded or failed; and the stored
// originals such open versions use that no delivered file already counts (a draft copied from the live version adds
// only what's new). inUseSql(p) is the expression with the creator id bound as parameter p, for use inside the insert
// that takes the room, so two uploads at once can't both squeeze under.
import { first } from "../lib/db.js";

const OPEN = "'draft', 'uploading', 'processing', 'ready', 'in_review'";

export const inUseSql = (p) => `((SELECT COALESCE(SUM(f.size_bytes), 0) FROM product_files f JOIN products p ON p.id = f.product_id JOIN projects j ON j.id = p.project_id
    WHERE j.creator_id = ${p} AND ((f.active = 1 AND f.status IN ('pending', 'published') AND f.retired_at IS NULL)
      OR (f.active = 0 AND f.blob_id IS NULL AND f.removed_at IS NOT NULL AND json_extract(COALESCE(f.meta, '{}'), '$.purgedAt') IS NULL)))
  + (SELECT COALESCE(SUM(u.size_bytes), 0) FROM uploads u JOIN pac_versions v ON v.id = u.version_id JOIN products p ON p.id = v.product_id
    JOIN projects j ON j.id = p.project_id WHERE j.creator_id = ${p} AND u.status IN ('open', 'complete') AND v.status IN (${OPEN}))
  + (SELECT COALESCE(SUM(b.size_bytes), 0) FROM blobs b WHERE b.id IN (SELECT e.blob_id FROM pac_entries e JOIN pac_versions v ON v.id = e.version_id
      JOIN products p ON p.id = v.product_id JOIN projects j ON j.id = p.project_id WHERE j.creator_id = ${p} AND v.status IN (${OPEN}))
    AND b.id NOT IN (SELECT f.blob_id FROM product_files f JOIN products p ON p.id = f.product_id JOIN projects j ON j.id = p.project_id
      WHERE j.creator_id = ${p} AND f.blob_id IS NOT NULL AND f.active = 1 AND f.status IN ('pending', 'published') AND f.retired_at IS NULL)))`;

export const storageUsed = async (db, creatorId) => (await first(db, `SELECT ${inUseSql("?1")} AS n`, creatorId)).n;

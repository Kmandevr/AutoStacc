// A creator's file storage in use, the one measure both kinds of upload check against the creator's quota
// (filesQuotaOf, policy.js): their delivered files (not yet retired) and removed files whose bytes aren't deleted yet
// (files/retention.js, a day), plus every pack archive on its way (uploaded or
// uploading for a version not yet published, discarded or failed; once checked, its unpacked size if that's larger). inUseSql(p) is the expression with the creator id
// bound as parameter p, for use inside the insert that takes the room, so two uploads at once can't both squeeze under.
import { first } from "../lib/db.js";

export const inUseSql = (p) => `((SELECT COALESCE(SUM(f.size_bytes), 0) FROM product_files f JOIN products p ON p.id = f.product_id JOIN projects j ON j.id = p.project_id
    WHERE j.creator_id = ${p} AND ((f.active = 1 AND f.status IN ('pending', 'published') AND f.retired_at IS NULL)
      OR (f.active = 0 AND f.blob_id IS NULL AND f.removed_at IS NOT NULL AND json_extract(COALESCE(f.meta, '{}'), '$.purgedAt') IS NULL)))
  + (SELECT COALESCE(SUM(MAX(u.size_bytes, COALESCE(json_extract(v.stats, '$.bytes'), 0))), 0) FROM uploads u JOIN pac_versions v ON v.id = u.version_id JOIN products p ON p.id = v.product_id
    JOIN projects j ON j.id = p.project_id WHERE j.creator_id = ${p} AND v.status IN ('draft', 'uploading', 'processing', 'ready', 'in_review')))`;

export const storageUsed = async (db, creatorId) => (await first(db, `SELECT ${inUseSql("?1")} AS n`, creatorId)).n;

// A creator's file storage in use, the one measure both kinds of upload check against the creator's quota
// (filesQuotaOf, policy.js): their delivered files (also those a revision replaced, still downloadable for 30 days: owner, 2026-10-15) and removed files whose bytes aren't deleted yet
// (files/retention.js, a day); every archive on its way in (uploaded or uploading, not yet unpacked: import and append
// mark it aborted once its bytes are gone) for a version not yet published, discarded or failed; every stored original
// of theirs no delivered file already counts (a draft's files, one copied from the live version adding only what's
// new, and files removed from a draft until the sweep deletes them: blobs/sweep.js); and their Pacs' preview clips. inUseSql(p) is the expression with the creator id bound as parameter p, for use inside the insert
// that takes the room, so two uploads at once can't both squeeze under.
import { first } from "../lib/db.js";

const OPEN = "'draft', 'uploading', 'processing', 'ready', 'in_review'";

export const inUseSql = (p) => `((SELECT COALESCE(SUM(f.size_bytes), 0) FROM product_files f JOIN products p ON p.id = f.product_id JOIN projects j ON j.id = p.project_id
    WHERE j.creator_id = ${p} AND ((f.active = 1 AND f.status IN ('pending', 'published'))
      OR (f.active = 0 AND f.blob_id IS NULL AND f.removed_at IS NOT NULL AND json_extract(COALESCE(f.meta, '{}'), '$.purgedAt') IS NULL)))
  + (SELECT COALESCE(SUM(u.size_bytes), 0) FROM uploads u JOIN pac_versions v ON v.id = u.version_id JOIN products p ON p.id = v.product_id
    JOIN projects j ON j.id = p.project_id WHERE j.creator_id = ${p} AND u.status IN ('open', 'complete') AND v.status IN (${OPEN}))
  + (SELECT COALESCE(SUM(b.size_bytes), 0) FROM blobs b WHERE b.owner_scope = ${p}
    AND b.id NOT IN (SELECT f.blob_id FROM product_files f JOIN products p ON p.id = f.product_id JOIN projects j ON j.id = p.project_id
      WHERE j.creator_id = ${p} AND f.blob_id IS NOT NULL AND f.active = 1))
  + (SELECT COALESCE(SUM(pp.size_bytes), 0) FROM pac_previews pp JOIN pacs pc ON pc.id = pp.pac_id JOIN projects j ON j.id = pc.project_id WHERE j.creator_id = ${p}))`;

export const storageUsed = async (db, creatorId) => (await first(db, `SELECT ${inUseSql("?1")} AS n`, creatorId)).n;

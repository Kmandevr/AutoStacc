// A creator's file storage in use, the one measure both kinds of upload check against the creator's quota
// (filesQuotaOf, policy.js) and paid storage bills from (server/billing/). It is the sum of PARTS, each counted once:
// - singleFiles: paid files uploaded one at a time (no stored original): delivered ones, and removed ones whose bytes
//   aren't deleted yet (files/retention.js, a day);
// - originals: every stored original of theirs, once, however many products, versions, folders or library views use
//   it (git-style, blobs.js): live and retired Pac files (a revision's replaced files stay downloadable for 30 days and
//   count for that time: owner, 2026-10-15), a draft's files, and files removed from a draft until the sweep deletes
//   them (blobs/sweep.js). Before 2026-10-16 a file kept by two products, or re-added with the same bytes, counted twice;
// - archives: every archive on its way in (uploaded or uploading, not yet unpacked: import and append mark it aborted
//   once its bytes are gone) for a version not yet published, discarded or failed;
// - previews: their Pacs' preview clips;
// - siteFiles: their site files (images and fonts, also those only old versions or their shared pieces still use, and
//   files of a piece they deleted that other creators' sites still use, until the daily sweep deletes them: sites/images.js).
// What AutoStacc makes on its own (deflated copies for ZIPs, waveforms, cached bundles) is never counted.
// inUseSql(p) is the expression with the creator id bound as parameter p, for use inside the insert that takes the room,
// so two uploads at once can't both squeeze under.
import { first } from "../lib/db.js";

const OPEN = "'draft', 'uploading', 'processing', 'ready', 'in_review'";

export const PARTS = {
  singleFiles: (p) => `(SELECT COALESCE(SUM(f.size_bytes), 0) FROM product_files f JOIN products p ON p.id = f.product_id JOIN projects j ON j.id = p.project_id
    WHERE j.creator_id = ${p} AND NOT EXISTS (SELECT 1 FROM blobs ob WHERE ob.id = f.blob_id AND ob.owner_scope = ${p})
      AND ((f.active = 1 AND f.status IN ('pending', 'published'))
        OR (f.active = 0 AND f.blob_id IS NULL AND f.removed_at IS NOT NULL AND json_extract(COALESCE(f.meta, '{}'), '$.purgedAt') IS NULL)))`,
  originals: (p) => `(SELECT COALESCE(SUM(b.size_bytes), 0) FROM blobs b WHERE b.owner_scope = ${p})`,
  archives: (p) => `(SELECT COALESCE(SUM(u.size_bytes), 0) FROM uploads u JOIN pac_versions v ON v.id = u.version_id JOIN products p ON p.id = v.product_id
    JOIN projects j ON j.id = p.project_id WHERE j.creator_id = ${p} AND u.status IN ('open', 'complete') AND v.status IN (${OPEN}))`,
  previews: (p) => `(SELECT COALESCE(SUM(pp.size_bytes), 0) FROM pac_previews pp JOIN pacs pc ON pc.id = pp.pac_id JOIN projects j ON j.id = pc.project_id WHERE j.creator_id = ${p})`,
  siteFiles: (p) => `(SELECT COALESCE(SUM(a.size_bytes), 0) FROM site_assets a WHERE a.creator_id = ${p} AND a.status = 'active')`
};

export const inUseSql = (p) => `(${Object.values(PARTS).map((part) => part(p)).join("\n  + ")})`;

export const storageUsed = async (db, creatorId) => (await first(db, `SELECT ${inUseSql("?1")} AS n`, creatorId)).n;

// The same total split by part ({ singleFiles, originals, ... }), from one query, so what a creator is shown adds up to
// what their quota and bill use.
export const storageByPart = (db, creatorId) =>
  first(db, `SELECT ${Object.entries(PARTS).map(([k, part]) => `${part("?1")} AS ${k}`).join(", ")}`, creatorId);

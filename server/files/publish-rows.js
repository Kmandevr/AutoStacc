// Publishing a Pac version into its product's paid files (product_files, owned by server/files/). A file keeps its id
// while its bytes don't change, so selections, links and download history stay valid across versions: an unchanged
// asset's row is updated in place, a replaced or removed one is retired (still downloadable to earlier buyers for 30
// days, docs/packs.md H8) and new or replaced assets get new rows. Returns statements for the caller's single batch.
import { stmt } from "../lib/db.js";
import { contentTypeFor } from "./policy.js";

const CHUNK = 300;

/**
 * entries: [{ assetId, blobId, filename, folderPath, sort, size, kind, meta }] for one version of one Pac.
 */
export function publishStmts(db, { productId, pacId, versionId, entries, t }) {
  const rows = entries.map((e) => ({ asset: e.assetId, blob: e.blobId, name: e.filename, folder: e.folderPath, sort: e.sort, size: e.size,
    type: contentTypeFor(e.filename), kind: e.kind || "", meta: JSON.stringify(e.meta || {}), id: e.fileId }));
  const out = [];
  // 1. Same asset, same bytes: the row stays (same id), with this version's name, folder and details.
  for (let i = 0; i < rows.length; i += CHUNK) {
    out.push(stmt(db, `UPDATE product_files SET version_id = ?, filename = j.value->>'name', folder_path = j.value->>'folder', sort = j.value->>'sort',
        kind = j.value->>'kind', meta = j.value->>'meta', pac_id = ?
      FROM json_each(?) j
      WHERE product_files.product_id = ? AND product_files.asset_id = j.value->>'asset' AND product_files.blob_id = j.value->>'blob'
        AND product_files.retired_at IS NULL`, versionId, pacId, JSON.stringify(rows.slice(i, i + CHUNK)), productId));
  }
  // 2. Everything of this Pac's earlier versions that wasn't kept: removed or replaced, so retired.
  out.push(stmt(db, `UPDATE product_files SET retired_at = ? WHERE product_id = ? AND pac_id = ? AND asset_id IS NOT NULL AND retired_at IS NULL
    AND (version_id IS NULL OR version_id <> ?)`, t, productId, pacId, versionId));
  // 3. New assets and new bytes: new rows, their storage key a placeholder (the blob holds the bytes).
  for (let i = 0; i < rows.length; i += CHUNK) {
    out.push(stmt(db, `INSERT INTO product_files (id, product_id, r2_key, filename, label, content_type, size_bytes, sort, active, created_at,
        pac_id, kind, status, status_at, asset_id, blob_id, version_id, folder_path, meta)
      SELECT j.value->>'id', ?, 'blob/' || (j.value->>'id'), j.value->>'name', '', j.value->>'type', j.value->>'size', j.value->>'sort', 1, ?,
        ?, j.value->>'kind', 'published', ?, j.value->>'asset', j.value->>'blob', ?, j.value->>'folder', j.value->>'meta'
      FROM json_each(?) j
      WHERE NOT EXISTS (SELECT 1 FROM product_files p WHERE p.product_id = ? AND p.asset_id = j.value->>'asset' AND p.retired_at IS NULL)`,
      productId, t, pacId, t, versionId, JSON.stringify(rows.slice(i, i + CHUNK)), productId));
  }
  return out;
}

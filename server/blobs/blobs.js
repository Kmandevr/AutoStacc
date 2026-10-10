// Stored originals (D1 blobs): one per owner and SHA-256, byte for byte as uploaded, shared by every version and product
// that keeps the same file (git-style). The hash and size are the storage relay's own (workers/engine/src/storage.js),
// never the engine's claim. Owner scope keeps creators apart: the same bytes from two creators are two blobs.
import { all, stmt, newId, now } from "../lib/db.js";

const CHUNK = 400;

/**
 * Claims stored originals for written files. A new blob starts with a deletion date a day out: the import that uses it
 * clears it in the same batch that adds the version's files, so a blob whose import never commits is swept, not kept.: [{ key, sha256, size, crc32, format, facts, engineVersion }]. Returns
 * statements that insert one blob per new (owner, sha256) and keep the existing one otherwise. Run them in a batch,
 * then call resolveClaims to learn which key each hash ended up with.
 */
export function claimStmts(db, ownerScope, files) {
  const t = now();
  const expires = new Date(Date.now() + 86400000).toISOString();
  const rows = files.map((f) => ({ id: newId("bl"), sha: f.sha256, crc: f.crc32, size: f.size, key: f.key, format: f.format || "unknown",
    facts: JSON.stringify(f.facts || {}), ev: f.engineVersion || null }));
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    out.push(stmt(db, `INSERT INTO blobs (id, owner_scope, sha256, crc32, size_bytes, r2_key, format, facts, engine_version, verified_at, created_at, delete_after)
      SELECT j.value->>'id', ?, j.value->>'sha', j.value->>'crc', j.value->>'size', j.value->>'key', j.value->>'format', j.value->>'facts', j.value->>'ev', ?, ?, ?
      FROM json_each(?) j WHERE true ON CONFLICT(owner_scope, sha256) DO NOTHING`, ownerScope, t, t, expires, JSON.stringify(rows.slice(i, i + CHUNK))));
  }
  return out;
}

/** { sha256: { id, key } } for these hashes of this owner. */
export async function blobsByHash(db, ownerScope, hashes) {
  const out = {};
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const rows = await all(db, "SELECT id, sha256, r2_key FROM blobs WHERE owner_scope = ? AND sha256 IN (SELECT value FROM json_each(?))",
      ownerScope, JSON.stringify(hashes.slice(i, i + CHUNK)));
    for (const r of rows) out[r.sha256] = { id: r.id, key: r.r2_key };
  }
  return out;
}

/** The storage key of one blob. */
export const blobKey = async (db, blobId) => (await all(db, "SELECT r2_key FROM blobs WHERE id = ?", blobId))[0]?.r2_key || null;

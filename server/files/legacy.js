// Files from before the Pack Builder, hashed (docs/packs.md Phase 9, "legacy import"): delivered files that aren't
// stored originals (single uploads, the catalog's files) have no checksum on record. The daily sweep reads a few of
// them a day from R2 (bounded by bytes) and records their SHA-256 and CRC-32 in product_files.meta, which lets them
// join ZIP downloads (server/downloads/bundle.js) and shows their integrity like Pack Builder files. Nothing about how
// they're stored, delivered or deleted changes. A file whose object is missing or a different size is marked, never
// retried, and the admins hear about it.
import { all, run, now } from "../lib/db.js";
import { getFile } from "../storage/buckets.js";
import { alertAdmins } from "../email/alerts.js";

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (the ZIP one) of chunks fed in order: crc32(chunk, previous). */
export function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// One object's SHA-256, CRC-32 and length, streamed (never held whole in memory).
async function hashObject(body) {
  const digest = new crypto.DigestStream("SHA-256");
  const writer = digest.getWriter();
  let crc = 0, size = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    crc = crc32(value, crc);
    size += value.length;
    await writer.write(value);
  }
  await writer.close();
  return { sha256: hex(await digest.digest), crc32: crc, size };
}

/** Hashes up to `limit` files, about `maxBytes` in all, oldest first. → { hashed, problems }. */
export async function hashLegacyFiles(app, { limit = 50, maxBytes = 512 * 1024 * 1024 } = {}) {
  const rows = await all(app.db, `SELECT id, product_id, r2_key, size_bytes FROM product_files WHERE blob_id IS NULL AND active = 1
    AND (meta IS NULL OR (json_extract(meta, '$.sha256') IS NULL AND json_extract(meta, '$.hashProblem') IS NULL)) ORDER BY created_at, id LIMIT ?`, limit);
  let bytes = 0, hashed = 0;
  const problems = [];
  for (const f of rows) {
    if (hashed && bytes + f.size_bytes > maxBytes) break;
    bytes += f.size_bytes;
    const obj = await getFile(app.env, f.r2_key);
    const got = obj ? await hashObject(obj.body) : null;
    const problem = !got ? "missing" : got.size !== f.size_bytes ? "size_mismatch" : null;
    if (problem) {
      problems.push({ id: f.id, problem });
      await run(app.db, "UPDATE product_files SET meta = json_set(COALESCE(meta, '{}'), '$.hashProblem', ?) WHERE id = ?", problem, f.id);
      continue;
    }
    await run(app.db, `UPDATE product_files SET meta = json_set(COALESCE(meta, '{}'), '$.sha256', ?, '$.crc32', ?, '$.hashedAt', ?)
      WHERE id = ? AND blob_id IS NULL`, got.sha256, got.crc32, now(), f.id);
    hashed++;
  }
  if (problems.length) {
    await alertAdmins(app, { key: `legacy-hash:${problems.map((p) => p.id).join(",")}`, title: "some delivered files don't match what the store has on record",
      lines: [...problems.map((p) => `${p.id}: ${p.problem === "missing" ? "its stored object is missing" : "its stored object is a different size"}.`), "Check them in the Control Center (Products)."] });
  }
  return { hashed, problems: problems.length };
}

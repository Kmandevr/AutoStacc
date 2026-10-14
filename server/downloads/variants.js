// Deflate variants for ZIP downloads (docs/packs.md §8, "Transport ZIP"; switch downloads.deflate, off by default):
// ZIPs are stored (not compressed) because audio barely deflates, but MIDI, presets and text often shrink a lot. The
// daily sweep probes published stored originals of those formats up to VARIANT_MAX: deflated to RATIO or less, the
// copy is checked (inflated again, its SHA-256 must be the original's) and kept at variants/<blob id>.deflate; either
// way the ratio is recorded so a file is probed once. Bundles then carry such files deflated (downloads/zip.js); the
// CRC-32 and size in the ZIP stay the original's, so unzipping verifies the original bytes. Deterministic: the same
// copy is used every time, so a ZIP's length is known before it starts. Made in the store, not the Container: it's a
// few small files, and CompressionStream is built in. Variants go with their original (blobs/sweep.js).
import { all, run } from "../lib/db.js";
import { getFile, deleteKeys } from "../storage/buckets.js";
import { isOn } from "../lib/features.js";
import { meterStmts } from "../usage/usage.js";

export const VARIANT_MAX = 8 * 1024 * 1024;
export const RATIO = 0.8;
// Formats worth probing: text-like and binary formats that usually deflate (never audio, images or archives).
const PROBE = ["midi", "fxp", "vital", "serum", "h2p", "nmsv", "sfz", "exs", "rpp", "text", "bitwig-preset", "bitwig-clip"];

export const variantKey = (blobId) => `variants/${blobId}.deflate`;

const through = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Probes up to `limit` originals (about `maxBytes` read). → how many variants were made. */
export async function makeVariants(app, { limit = 100, maxBytes = 64 * 1024 * 1024 } = {}) {
  if (!isOn(app, "downloads.deflate")) return 0;
  const rows = await all(app.db, `SELECT b.id, b.r2_key, b.size_bytes, b.sha256 FROM blobs b WHERE b.compress_ratio IS NULL AND b.delete_after IS NULL
    AND b.size_bytes BETWEEN 64 AND ? AND b.format IN (SELECT value FROM json_each(?))
    AND EXISTS (SELECT 1 FROM product_files f WHERE f.blob_id = b.id AND f.active = 1 AND f.status = 'published') ORDER BY b.created_at LIMIT ?`,
  VARIANT_MAX, JSON.stringify(PROBE), limit);
  let read = 0, made = 0;
  for (const b of rows) {
    if (read && read + b.size_bytes > maxBytes) break;
    read += b.size_bytes;
    const obj = await getFile(app.env, b.r2_key);
    if (!obj) continue;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const packed = await through(bytes, new CompressionStream("deflate-raw"));
    const ratio = packed.length / Math.max(1, bytes.length);
    let keep = ratio <= RATIO;
    if (keep) {
      // Checked before it's trusted: it must inflate to exactly the original.
      const back = await through(packed, new DecompressionStream("deflate-raw"));
      keep = hex(await crypto.subtle.digest("SHA-256", back)) === b.sha256;
    }
    if (keep) {
      await app.env.FILES.put(variantKey(b.id), packed, { httpMetadata: { contentType: "application/octet-stream" } });
      await app.db.batch(meterStmts(app.db, { class_a: 1 }));
    }
    // Recorded only while the original is still wanted; if a sweep let it go meanwhile, its copy goes too.
    const res = await run(app.db, "UPDATE blobs SET compress_ratio = ?, deflate_bytes = ? WHERE id = ? AND delete_after IS NULL",
      Math.round(ratio * 1000) / 1000, keep ? packed.length : null, b.id);
    if (keep && !res.meta.changes) await deleteKeys(app.env, [variantKey(b.id)]);
    else if (keep) made++;
  }
  return made;
}

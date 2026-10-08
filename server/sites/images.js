// Images creators upload for their sites (D1 site_assets, R2 PREVIEWS under sites/<creator>/). Only real PNG, JPEG,
// GIF or WebP files are kept: the type comes from the file's first bytes, never from its name or the browser, so an
// HTML or SVG file can't be passed off as an image. Size, count and the creator's storage quota are checked before
// anything is stored, and the row is written only if the quota still holds (two uploads at once can't both squeeze in).
import { all, first, run, newId, now } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { LIMITS, quotaOf } from "../creators/policy.js";

const TYPES = [
  { type: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a },
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", ext: "gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61 },
  { type: "image/webp", ext: "webp", test: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" }
];

export const sniffImage = (bytes) => TYPES.find((t) => bytes.length >= 12 && t.test(bytes)) || null;

export const imageSrc = (id) => `/media/sites/${id}`;
export const usageOf = async (db, creatorId) =>
  first(db, "SELECT COUNT(*) AS files, COALESCE(SUM(size_bytes), 0) AS bytes FROM site_assets WHERE creator_id = ? AND status = 'active'", creatorId);
export const listImages = (db, creatorId) =>
  all(db, "SELECT id, filename, content_type, size_bytes, created_at FROM site_assets WHERE creator_id = ? AND status = 'active' ORDER BY created_at DESC", creatorId);
// The creator's active images among these ids (a document may only show its own creator's images).
export const ownImages = (db, creatorId, ids) => (ids.length
  ? all(db, `SELECT id FROM site_assets WHERE creator_id = ? AND status = 'active' AND id IN (${ids.map(() => "?").join(",")})`, creatorId, ...ids)
  : Promise.resolve([]));
// What /media/sites/<id> serves: an active image of a creator that isn't suspended.
export const servableImage = (db, id) => first(db,
  `SELECT a.r2_key, a.content_type, a.size_bytes FROM site_assets a JOIN creators c ON c.id = a.creator_id
   WHERE a.id = ? AND a.status = 'active' AND c.status = 'active' AND c.deleted_at IS NULL`, id);

export async function uploadImage(app, creator, user, filename) {
  const declared = Number(app.request.headers.get("content-length") || 0);
  if (!declared) fail(411, "length_required", "Send the image with its size.");
  if (declared > LIMITS.imageBytes) fail(413, "too_large", `Images must be under ${LIMITS.imageBytes / 1048576} MB.`);
  const usage = await usageOf(app.db, creator.id);
  if (usage.files >= LIMITS.imagesPerCreator) fail(409, "limit_reached", `Up to ${LIMITS.imagesPerCreator} images per creator. Delete some first.`);
  if (usage.bytes + declared > quotaOf(creator)) fail(409, "quota_exceeded", "That would go over your free storage. Delete some images first.");
  const bytes = new Uint8Array(await app.request.arrayBuffer());
  if (bytes.length > LIMITS.imageBytes || bytes.length !== declared) fail(400, "bad_upload", "The upload didn't arrive whole. Try again.");
  const kind = sniffImage(bytes);
  if (!kind) fail(415, "unsupported_media_type", "Upload a PNG, JPEG, GIF or WebP image.");
  const id = newId("as");
  const key = `sites/${creator.id}/${id}.${kind.ext}`;
  await app.env.PREVIEWS.put(key, bytes, { httpMetadata: { contentType: kind.type, cacheControl: "public, max-age=86400" } });
  const res = await run(app.db,
    `INSERT INTO site_assets (id, creator_id, r2_key, filename, content_type, size_bytes, status, created_by, created_at)
     SELECT ?, ?, ?, ?, ?, ?, 'active', ?, ?
     WHERE (SELECT COALESCE(SUM(size_bytes), 0) FROM site_assets WHERE creator_id = ? AND status = 'active') + ? <= ?
       AND (SELECT COUNT(*) FROM site_assets WHERE creator_id = ? AND status = 'active') < ?`,
    id, creator.id, key, filename, kind.type, bytes.length, user.id, now(), creator.id, bytes.length, quotaOf(creator), creator.id, LIMITS.imagesPerCreator);
  if (!res.meta.changes) {
    await app.env.PREVIEWS.delete(key);
    fail(409, "quota_exceeded", "That would go over your free storage. Delete some images first.");
  }
  return { id, src: imageSrc(id), contentType: kind.type, sizeBytes: bytes.length, filename };
}

// Deleting frees the quota at once and removes the file: pages showing it lose that image.
export async function deleteImage(app, creatorId, id) {
  const row = await first(app.db, "SELECT r2_key FROM site_assets WHERE id = ? AND creator_id = ? AND status = 'active'", id, creatorId);
  if (!row) fail(404, "not_found", "No image with that id.");
  await run(app.db, "UPDATE site_assets SET status = 'deleted', deleted_at = ? WHERE id = ?", now(), id);
  await app.env.PREVIEWS.delete(row.r2_key);
}

// Files creators upload for their sites (D1 site_assets, R2 PREVIEWS under sites/<creator>/): images (PNG, JPEG, GIF,
// WebP) and fonts (WOFF2). Only real files of those kinds are kept: the type comes from the file's first bytes, never
// from its name or the browser, so an HTML or SVG file can't be passed off as one. Size, count and the creator's one
// storage quota (creators/storage.js, everything they store) are checked before anything is stored, and the row is
// written only if the quota still holds (two uploads at once can't both squeeze in). A file deleted while an old
// version of one of their sites still uses it is hidden instead (still served and counted) until nothing does.
import { all, first, run, newId, now } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { LIMITS, quotaOf } from "../creators/policy.js";
import { inUseSql, storageUsed } from "../creators/storage.js";

const TYPES = [
  { type: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a },
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", ext: "gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61 },
  { type: "image/webp", ext: "webp", test: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
  // WOFF2: its signature, a known flavor (TrueType, CFF or Apple "true") and a header whose length is the file's.
  { type: "font/woff2", ext: "woff2", font: true, test: (b) => {
    const u32 = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    return b.length >= 48 && u32(0) === 0x774f4632 && [0x00010000, 0x4f54544f, 0x74727565].includes(u32(4)) && u32(8) === b.length;
  } }
];

export const sniffImage = (bytes) => TYPES.find((t) => !t.font && bytes.length >= 12 && t.test(bytes)) || null;
export const sniffFile = (bytes) => TYPES.find((t) => bytes.length >= 12 && t.test(bytes)) || null;

export const imageSrc = (id) => `/media/sites/${id}`;
export const usageOf = async (db, creatorId) =>
  first(db, "SELECT COUNT(*) AS files, COALESCE(SUM(size_bytes), 0) AS bytes FROM site_assets WHERE creator_id = ? AND status = 'active'", creatorId);
export const listImages = (db, creatorId) =>
  all(db, "SELECT id, filename, content_type, size_bytes, created_at FROM site_assets WHERE creator_id = ? AND status = 'active' AND hidden_at IS NULL ORDER BY created_at DESC", creatorId);
// The creator's active files among these ids (a document may only show its own creator's files).
export const ownImages = (db, creatorId, ids) => (ids.length
  ? all(db, `SELECT id, content_type FROM site_assets WHERE creator_id = ? AND status = 'active' AND id IN (${ids.map(() => "?").join(",")})`, creatorId, ...ids)
  : Promise.resolve([]));
// What /media/sites/<id> serves: an active file of a creator that isn't suspended.
export const servableImage = (db, id) => first(db,
  `SELECT a.r2_key, a.content_type, a.size_bytes FROM site_assets a JOIN creators c ON c.id = a.creator_id
   WHERE a.id = ? AND a.status = 'active' AND c.status = 'active' AND c.deleted_at IS NULL`, id);

const over = () => fail(409, "quota_exceeded", "That would go over your storage. Delete some files first; your live pages stay up.");

export async function uploadImage(app, creator, user, filename) {
  const declared = Number(app.request.headers.get("content-length") || 0);
  if (!declared) fail(411, "length_required", "Send the file with its size.");
  if (declared > LIMITS.imageBytes) fail(413, "too_large", `Images must be under ${LIMITS.imageBytes / 1048576} MB, fonts under ${LIMITS.fontBytes / 1048576} MB.`);
  const [usage, used] = await Promise.all([usageOf(app.db, creator.id), storageUsed(app.db, creator.id)]);
  if (usage.files >= LIMITS.imagesPerCreator) fail(409, "limit_reached", `Up to ${LIMITS.imagesPerCreator} files per creator. Delete some first.`);
  if (used + declared > quotaOf(creator)) over();
  const bytes = new Uint8Array(await app.request.arrayBuffer());
  if (bytes.length > LIMITS.imageBytes || bytes.length !== declared) fail(400, "bad_upload", "The upload didn't arrive whole. Try again.");
  const kind = sniffFile(bytes);
  if (!kind) fail(415, "unsupported_media_type", "Upload a PNG, JPEG, GIF or WebP image, or a WOFF2 font.");
  if (kind.font && bytes.length > LIMITS.fontBytes) fail(413, "too_large", `Fonts must be under ${LIMITS.fontBytes / 1048576} MB.`);
  const id = newId("as");
  const key = `sites/${creator.id}/${id}.${kind.ext}`;
  await app.env.PREVIEWS.put(key, bytes, { httpMetadata: { contentType: kind.type, cacheControl: "public, max-age=86400" } });
  const res = await run(app.db,
    `INSERT INTO site_assets (id, creator_id, r2_key, filename, content_type, size_bytes, status, created_by, created_at)
     SELECT ?2, ?1, ?3, ?4, ?5, ?6, 'active', ?7, ?8
     WHERE ${inUseSql("?1")} + ?6 <= ?9
       AND (SELECT COUNT(*) FROM site_assets WHERE creator_id = ?1 AND status = 'active') < ?10`,
    creator.id, id, key, filename, kind.type, bytes.length, user.id, now(), quotaOf(creator), LIMITS.imagesPerCreator);
  if (!res.meta.changes) {
    await app.env.PREVIEWS.delete(key);
    over();
  }
  return { id, src: imageSrc(id), contentType: kind.type, sizeBytes: bytes.length, filename };
}

// Whether any kept version, draft or published document of the creator's sites still names this file.
async function stillUsed(db, creatorId, id) {
  const like = `%${id}%`;
  const row = await first(db, `SELECT
    EXISTS (SELECT 1 FROM site_versions v JOIN projects p ON v.kind = 'project' AND p.id = v.site_id WHERE p.creator_id = ?1 AND v.doc LIKE ?2)
    OR EXISTS (SELECT 1 FROM site_versions WHERE kind = 'profile' AND site_id = ?1 AND doc LIKE ?2)
    OR EXISTS (SELECT 1 FROM project_sites s JOIN projects p ON p.id = s.project_id WHERE p.creator_id = ?1 AND p.deleted_at IS NULL AND (s.published LIKE ?2 OR s.scheduled_draft LIKE ?2))
    OR EXISTS (SELECT 1 FROM creator_sites WHERE creator_id = ?1 AND (published LIKE ?2 OR scheduled_draft LIKE ?2)) AS used`, creatorId, like);
  return Boolean(row && row.used);
}

async function purge(app, id, key) {
  await run(app.db, "UPDATE site_assets SET status = 'deleted', deleted_at = ? WHERE id = ?", now(), id);
  await app.env.PREVIEWS.delete(key);
}

// Deleting removes the file and frees its storage at once, unless a published site or a kept version still uses it:
// then it is hidden from the creator's files and goes once nothing uses it (releaseHidden, after each publish).
export async function deleteImage(app, creatorId, id) {
  const row = await first(app.db, "SELECT r2_key FROM site_assets WHERE id = ? AND creator_id = ? AND status = 'active' AND hidden_at IS NULL", id, creatorId);
  if (!row) fail(404, "not_found", "No file with that id.");
  if (await stillUsed(app.db, creatorId, id)) {
    await run(app.db, "UPDATE site_assets SET hidden_at = ? WHERE id = ?", now(), id);
    return { kept: true };
  }
  await purge(app, id, row.r2_key);
  return { kept: false };
}

export async function releaseHidden(app, creatorId) {
  const hidden = await all(app.db, "SELECT id, r2_key FROM site_assets WHERE creator_id = ? AND status = 'active' AND hidden_at IS NOT NULL", creatorId);
  for (const h of hidden) if (!(await stillUsed(app.db, creatorId, h.id))) await purge(app, h.id, h.r2_key);
}

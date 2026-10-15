// A Pac's preview clips (owner, 2026-10-15): up to three short audio clips customers can play on the product page and
// in Your Stacc, each uploaded by the creator or cut from one of the Pac's own audio files in the creator's browser
// (js/studio-pac-previews.js; the clip is what's stored, never the original). Public by nature: stored in the PREVIEWS
// bucket under a new name each time (pac id plus a random part, so a replaced clip is never served from a cache),
// audio whose bytes match its name, under 20 MB. Under each scope (an admin's for any Pac, a creator's for their own
// product's): GET, POST ?filename=&title=&asset= (the body is the clip), DELETE …/:previewId. Audited.
import { json, fail, str, id } from "../lib/http.js";
import { all, first, run, now, newId, randomToken } from "../lib/db.js";
import { audit } from "../audit/log.js";
import { limit } from "../lib/ratelimit.js";
import { requireFeature } from "../lib/features.js";
import { extensionOf, contentTypeFor, looksLike, PREVIEW_EXTENSIONS } from "../files/policy.js";
import { putPreview, peekPreview, deletePreview } from "../storage/buckets.js";
import { ADMIN, STUDIO, ensureStudioPac } from "./access.js";

export const PREVIEWS_PER_PAC = 3;
export const PREVIEW_MAX = 20 * 1024 * 1024;

/** Public: each Pac's clips, in order: { pacId: [{ id, title, url }] }. */
export async function previewsOf(db, pacIds) {
  if (!pacIds.length) return {};
  const rows = await all(db, "SELECT id, pac_id, title, r2_key FROM pac_previews WHERE pac_id IN (SELECT value FROM json_each(?)) ORDER BY sort", JSON.stringify(pacIds));
  const out = {};
  for (const r of rows) (out[r.pac_id] ||= []).push({ id: r.id, title: r.title, url: `/media/${r.r2_key}` });
  return out;
}

async function list(app, pac) {
  return json({ previews: (await previewsOf(app.db, [pac.id]))[pac.id] || [], max: PREVIEWS_PER_PAC });
}

async function add(app, pac, user) {
  await limit(app, "pack-preview", 30, 3600);
  const q = new URL(app.request.url).searchParams;
  const filename = str(q.get("filename") || "", "filename", { max: 160 });
  const title = str(q.get("title") || "", "title", { min: 0, max: 80 }).trim();
  const ext = extensionOf(filename);
  const contentType = contentTypeFor(filename);
  if (!PREVIEW_EXTENSIONS.has(ext) || !contentType.startsWith("audio/")) fail(415, "unsupported_media_type", "Previews must be MP3, M4A, OGG or WAV audio.");
  const size = Number(app.request.headers.get("content-length") || 0);
  if (!size || size > PREVIEW_MAX) fail(413, "too_large", "Previews must be under 20 MB.");
  // Cut from one of the Pac's own files: which one, as the creator says (it must be this Pac's).
  const asset = q.get("asset") ? id(q.get("asset"), "asset") : null;
  if (asset && !(await first(app.db, "SELECT 1 FROM assets WHERE id = ? AND pac_id = ?", asset, pac.id))) fail(400, "invalid_asset", "That file isn't in this Pac.");
  if ((await first(app.db, "SELECT COUNT(*) AS n FROM pac_previews WHERE pac_id = ?", pac.id)).n >= PREVIEWS_PER_PAC) fail(409, "previews_full", `A Pac has up to ${PREVIEWS_PER_PAC} previews. Remove one first.`);
  const key = `previews/pac-${pac.id.replace(/[^a-z0-9-]/gi, "")}-${randomToken(6)}.${ext}`;
  await putPreview(app.env, key, app.request.body, contentType);
  if (!looksLike(filename, await peekPreview(app.env, key))) {
    await deletePreview(app.env, key);
    fail(415, "content_mismatch", "That file isn't really audio of the kind its name says.");
  }
  const pid = newId("pp");
  // The first free place of the three; two uploads at once can't both take the last one (UNIQUE (pac_id, sort)).
  const res = await run(app.db, `INSERT INTO pac_previews (id, pac_id, sort, title, r2_key, content_type, size_bytes, source_asset_id, created_by, created_at)
    SELECT ?, ?, s.n, ?, ?, ?, ?, ?, ?, ? FROM (SELECT MIN(n) AS n FROM (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2)
      WHERE n NOT IN (SELECT sort FROM pac_previews WHERE pac_id = ?)) s WHERE s.n IS NOT NULL`,
    pid, pac.id, title, key, contentType, size, asset, user.id, now(), pac.id).catch(() => ({ meta: { changes: 0 } }));
  if (!res.meta.changes) {
    await deletePreview(app.env, key);
    fail(409, "previews_full", `A Pac has up to ${PREVIEWS_PER_PAC} previews. Remove one first.`);
  }
  await audit(app, "pack.preview_added", { targetType: "pac", targetId: pac.id, detail: { previewId: pid, fromFile: Boolean(asset) } });
  return list(app, pac);
}

async function remove(app, pac, previewId) {
  const row = await first(app.db, "SELECT * FROM pac_previews WHERE id = ? AND pac_id = ?", str(previewId, "previewId", { max: 40 }), pac.id);
  if (!row) fail(404, "not_found", "No such preview.");
  await run(app.db, "DELETE FROM pac_previews WHERE id = ?", row.id);
  await deletePreview(app.env, row.r2_key);
  await audit(app, "pack.preview_removed", { targetType: "pac", targetId: pac.id, detail: { previewId: row.id } });
  return list(app, pac);
}

// The Pac a request is about, through the scope (404 to anyone outside it).
const adminPac = async (app, pacId) => {
  requireFeature(app, "packs.editor");
  const actor = await ADMIN.actor(app);
  const pac = await first(app.db, "SELECT * FROM pacs WHERE id = ? AND deleted_at IS NULL", str(pacId, "pacId", { max: 80 }));
  if (!pac) fail(404, "not_found", "No such Pac.");
  return { pac, user: actor.user };
};
const studioPac = async (app, productId) => {
  requireFeature(app, "packs.editor");
  const actor = await STUDIO.actor(app);
  const { product } = await STUDIO.product(app, actor, productId);
  return { pac: await ensureStudioPac(app.db, product), user: actor.user };
};

export const routes = [
  ["GET", "/api/admin/packs/:pacId/previews", async (app, p) => list(app, (await adminPac(app, p.pacId)).pac)],
  ["POST", "/api/admin/packs/:pacId/previews", async (app, p) => { const { pac, user } = await adminPac(app, p.pacId); return add(app, pac, user); }],
  ["DELETE", "/api/admin/packs/:pacId/previews/:previewId", async (app, p) => remove(app, (await adminPac(app, p.pacId)).pac, p.previewId)],
  ["GET", "/api/studio/packs/products/:productId/previews", async (app, p) => list(app, (await studioPac(app, p.productId)).pac)],
  ["POST", "/api/studio/packs/products/:productId/previews", async (app, p) => { const { pac, user } = await studioPac(app, p.productId); return add(app, pac, user); }],
  ["DELETE", "/api/studio/packs/products/:productId/previews/:previewId", async (app, p) => remove(app, (await studioPac(app, p.productId)).pac, p.previewId)]
];

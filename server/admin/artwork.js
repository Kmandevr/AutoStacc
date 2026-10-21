// Admin, release artwork into storage (#179): a release whose artwork is still a file of the site (HAIL's
// /img/releases/*, from the data/ era) keeps working as it is until the owner runs this once. It copies each such file
// from the deployed static assets into its creator's site storage (sites/images.js uploadImage: the same type sniffing,
// size and quota checks as any Studio image), then points the release at it ({ asset, width, height, alt }, a
// compare-and-set in content/content.js). Idempotent: a moved release isn't listed again, and a file stored for a
// release that changed meanwhile is deleted again. Refused while impersonating (a write with no opt-in) and audited.
import { json } from "../lib/http.js";
import { first } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { getCreator } from "../creators/creators.js";
import { uploadImage, purge } from "../sites/images.js";
import { releasesWithLocalArtwork, swapReleaseArtwork } from "../content/content.js";
import { audit } from "../audit/log.js";

// Only a plain root-relative path of the site's own files: never another host, "//host" or a way out with "..".
const LOCAL = /^\/(?!\/)(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const MAX_BYTES = 10 * 1024 * 1024;

const pending = async (db) => (await releasesWithLocalArtwork(db)).filter((r) => r.artwork && LOCAL.test(String(r.artwork.src || "")));

// The file's bytes from the deployed static assets (env.ASSETS on Cloudflare Pages), or from the site itself.
async function fetchLocal(app, src) {
  const url = new URL(src, app.config.siteUrl);
  const res = app.env.ASSETS ? await app.env.ASSETS.fetch(url) : await fetch(url, { redirect: "manual" });
  if (!res.ok) throw Object.assign(new Error("missing"), { code: "not_found" });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) throw Object.assign(new Error("size"), { code: "too_large" });
  return bytes;
}

// uploadImage reads the request's declared size and its bytes: hand it these instead of the admin's (empty) request.
const withBytes = (app, bytes) => ({ ...app, request: { url: app.request.url, method: "POST",
  headers: new Headers({ "content-length": String(bytes.length) }), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) } });

async function list(app) {
  await requireAdmin(app);
  return json({ pending: (await pending(app.db)).map((r) => ({ releaseId: r.id, project: r.project_id, src: r.artwork.src })) });
}

async function move(app) {
  const admin = await requireAdmin(app);
  const moved = [], failed = [], stored = new Map();
  for (const r of await pending(app.db)) {
    const { src, width = null, height = null, alt = "" } = r.artwork;
    const key = `${r.creator_id} ${src}`;
    try {
      if (!stored.has(key)) {
        const creator = await getCreator(app.db, r.creator_id);
        if (!creator) throw Object.assign(new Error("creator"), { code: "creator_missing" });
        const filename = src.split("/").pop().slice(-120);
        stored.set(key, { ...(await uploadImage(withBytes(app, await fetchLocal(app, src)), creator, admin, filename)), used: 0 });
      }
      const img = stored.get(key);
      if (await swapReleaseArtwork(app.db, r.id, src, { asset: img.id, width, height, alt })) {
        img.used += 1;
        moved.push({ releaseId: r.id, from: src, asset: img.id });
      } else failed.push({ releaseId: r.id, from: src, code: "changed" });
    } catch (e) {
      failed.push({ releaseId: r.id, from: src, code: e.code || "error" });
    }
  }
  // A file stored for a release that changed meanwhile isn't kept.
  for (const img of stored.values()) {
    if (img.used) continue;
    const row = await first(app.db, "SELECT r2_key FROM site_assets WHERE id = ?", img.id);
    if (row) await purge(app, img.id, row.r2_key);
  }
  await audit(app, "release.artwork_moved", { targetType: "release", targetId: moved.map((m) => m.releaseId).join(",") || null,
    detail: { moved: moved.length, failed: failed.length, codes: failed.map((f) => f.code).join(",").slice(0, 200) } });
  return json({ moved, failed, remaining: (await pending(app.db)).length });
}

export const routes = [
  ["GET", "/api/admin/content/artwork", list],
  ["POST", "/api/admin/content/artwork/move", move]
];

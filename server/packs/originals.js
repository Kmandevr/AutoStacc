// A creator's own originals, back out (docs/vision.md §10: creators can download the original files they uploaded;
// docs/packs.md Phase 9): any checked version of their Pac, one file at a time or the whole version as a ZIP in its
// folders, byte for byte as stored. Under both scopes (routes.js shared): an admin for any Pac, a creator's members for
// their own; anyone else gets 404 like any other route here. Not a customer download: nothing is logged as served.
import { all, first } from "../lib/db.js";
import { fail, id } from "../lib/http.js";
import { limit } from "../lib/ratelimit.js";
import { getFile, safeFilename } from "../storage/buckets.js";
import { zipStream } from "../downloads/zip.js";
import { layout } from "../downloads/bundle.js";
import { loadManifest } from "./manifest.js";

const CHECKED = ["ready", "in_review", "published", "superseded"];

const headers = (type, length, name) => ({
  "Content-Type": type,
  "Content-Length": String(length),
  "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer"
});

// The version's files with what a ZIP needs (their stored originals; one a sweep has removed since is left out).
async function filesOf(app, v) {
  if (!CHECKED.includes(v.status)) fail(409, "not_checked", "Only a checked version's files can be downloaded.");
  const { files } = await loadManifest(app.db, v.id);
  const blobs = new Map((await all(app.db, "SELECT id, r2_key, size_bytes, crc32 FROM blobs WHERE id IN (SELECT value FROM json_each(?))",
    JSON.stringify(files.map((f) => f.blobId)))).map((b) => [b.id, b]));
  return files.filter((f) => blobs.has(f.blobId)).map((f) => ({ ...f, blob: blobs.get(f.blobId) }));
}

export const originalRoutes = (scope) => [
  ["GET", `${scope.prefix}/versions/:versionId/files/:assetId`, async (app, { versionId, assetId }) => {
    const actor = await scope.actor(app);
    await limit(app, "pack-originals", 600, 3600);
    const v = await scope.version(app, actor, versionId);
    const asset = id(assetId, "assetId");
    const f = (await filesOf(app, v)).find((x) => x.assetId === asset);
    const object = f && (await getFile(app.env, f.blob.r2_key));
    if (!object) fail(404, "not_found", "No such file in this version.");
    return new Response(object.body, { headers: headers("application/octet-stream", object.size, safeFilename(f.filename)) });
  }],
  ["GET", `${scope.prefix}/versions/:versionId/download`, async (app, { versionId }) => {
    const actor = await scope.actor(app);
    await limit(app, "pack-originals-zip", 30, 3600);
    const v = await scope.version(app, actor, versionId);
    const files = await filesOf(app, v);
    if (!files.length) fail(404, "not_found", "This version has no files to download.");
    const names = layout(files.map((f) => ({ product_id: "p", pac_id: v.pac_id, folder_path: f.folderPath, filename: f.filename })));
    const { length, stream } = zipStream(files.map((f, i) => ({
      name: names[i], size: f.blob.size_bytes, crc32: f.blob.crc32, open: async () => (await getFile(app.env, f.blob.r2_key))?.body
    })));
    const pac = await first(app.db, "SELECT title FROM pacs WHERE id = ?", v.pac_id);
    return new Response(stream, { headers: headers("application/zip", length, safeFilename(`${(pac && pac.title) || "Pac"} v${v.number}.zip`)) });
  }]
];

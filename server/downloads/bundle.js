// Bundle downloads (docs/packs.md §9): several files the requester owns (a folder, a Pac, a product, or any selection,
// across products) as one ZIP, built on the fly from the stored originals (zip.js). Access stays per product: each file
// is checked against its own product's entitlement when the link is made and again when it is used, and the link only
// works for the person it was made for. Each served file is logged like a single download (the refund rule counts it).
//   POST /api/downloads/bundle {fileIds}  → { url, files, bytes, expiresAt }   (up to 2,000 files, 20 GB)
//   GET  /api/downloads/bundle/:token     → the ZIP
import { json, fail, readJson } from "../lib/http.js";
import { all, run, first, newId, now, parseJson } from "../lib/db.js";
import { resolveAccess, requireAccess, subjectsOf } from "../entitlements/access.js";
import { activeEntitlements, usableEntitlement } from "../entitlements/grants.js";
import { deliverableAs, stillDelivered } from "../files/files.js";
import { getFile, safeFilename } from "../storage/buckets.js";
import { limit } from "../lib/ratelimit.js";
import { signBundle, readBundle } from "./tokens.js";
import { logEvent, logServedMany, subjectFor } from "./events.js";
import { zipStream } from "./zip.js";

export const BUNDLE_MAX_FILES = 2000;
export const BUNDLE_MAX_BYTES = 20 * 1024 ** 3;
const FILE_ID = /^pf_[a-z2-7]+$/;

// The files with what a ZIP needs: their stored original's key, size and CRC-32 (files uploaded before Pack Builder
// have no CRC on record, so they download one at a time).
const filesWithBlobs = (db, ids) => all(db, `SELECT f.id, f.product_id, f.pac_id, f.filename, f.folder_path, f.retired_at, b.r2_key AS blob_key, b.size_bytes, b.crc32,
    p.title AS product_title, pc.title AS pac_title
  FROM product_files f JOIN products p ON p.id = f.product_id LEFT JOIN blobs b ON b.id = f.blob_id LEFT JOIN pacs pc ON pc.id = f.pac_id
  WHERE ${deliverableAs("f")} AND f.id IN (SELECT value FROM json_each(?))`, JSON.stringify(ids));

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const part = (s) => {
  const clean = safeFilename(String(s || "").replace(/[\\/]+/g, " ")).replace(/[. ]+$/, "") || "file";
  return RESERVED.test(clean) ? `_${clean}` : clean;
};

/** Names inside the ZIP: folder/file for one Pac; product (and Pac) folders above when the bundle spans more. */
export function layout(files) {
  const products = new Set(files.map((f) => f.product_id));
  // A Pac folder only where a product brings more than one Pac.
  const pacsOf = new Map();
  for (const f of files) (pacsOf.get(f.product_id) || pacsOf.set(f.product_id, new Set()).get(f.product_id)).add(f.pac_id || "");
  const taken = new Set();
  return files.map((f) => {
    const segs = [];
    if (products.size > 1) segs.push(part(f.product_title));
    if (pacsOf.get(f.product_id).size > 1 && f.pac_title) segs.push(part(f.pac_title));
    for (const s of String(f.folder_path || "").split("/").filter(Boolean)) segs.push(part(s));
    const name = part(f.filename);
    let full = [...segs, name].join("/");
    // Names that would land on one file on Windows or macOS (case only) get " (2)", " (3)" in a fixed order.
    for (let n = 2; taken.has(full.toLowerCase()); n++) {
      const dot = name.lastIndexOf(".");
      full = [...segs, dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`].join("/");
    }
    taken.add(full.toLowerCase());
    return full;
  });
}

async function issue(app) {
  await limit(app, "bundle", 10, 60);
  const access = await requireAccess(app);
  const body = await readJson(app.request, 128 * 1024);
  const ids = [...new Set(Array.isArray(body.fileIds) ? body.fileIds : [])];
  if (!ids.length || ids.length > BUNDLE_MAX_FILES || !ids.every((x) => typeof x === "string" && FILE_ID.test(x))) {
    fail(400, "invalid_files", `Choose from 1 to ${BUNDLE_MAX_FILES} files.`);
  }
  const files = await filesWithBlobs(app.db, ids);
  const ents = new Map();
  for (const pid of new Set(files.map((f) => f.product_id))) ents.set(pid, (await activeEntitlements(app.db, access, pid)).find((e) => subjectFor(access, e)));
  if (files.length !== ids.length || files.some((f) => !ents.get(f.product_id) || !stillDelivered(f, ents.get(f.product_id).granted_at))) {
    await logEvent(app, "denied", { reason: "bundle: no entitlement", subject: subjectsOf(access)[0] });
    fail(403, "download_denied", "Some of those files aren't in your Stacc.");
  }
  if (files.some((f) => !f.blob_key)) fail(409, "not_bundleable", "Some of those files can only be downloaded one at a time.");
  const bytes = files.reduce((n, f) => n + f.size_bytes, 0);
  if (bytes > BUNDLE_MAX_BYTES) fail(413, "bundle_too_large", "That's more than 20 GB; download it in parts.");
  const subject = subjectFor(access, ents.get(files[0].product_id));
  const id = newId("bd");
  const ttl = app.config.downloadTtlSeconds;
  await run(app.db, "INSERT INTO download_bundles (id, subject, file_ids, layout_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    id, subject, JSON.stringify(files.map((f) => ({ f: f.id, e: ents.get(f.product_id).id }))), String(files.length),
    new Date(Date.now() + ttl * 1000).toISOString(), now());
  const { token, expiresAt } = await signBundle(app.config.downloadSecret, { bundleId: id, subject, ttlSeconds: ttl });
  return json({ url: `/api/downloads/bundle/${token}`, files: files.length, bytes, expiresAt });
}

const back = (reason) => new Response(null, { status: 303, headers: { Location: `/library?download=${reason}`, "Cache-Control": "no-store" } });

async function redeem(app, { token }) {
  await limit(app, "bundle-get", 30, 60);
  const { payload, error } = await readBundle(app.config.downloadSecret, token);
  if (error) return back(error === "expired" ? "expired" : "denied");
  const access = await resolveAccess(app);
  const deny = async (reason) => (await logEvent(app, "denied", { reason: `bundle: ${reason}`, subject: payload.s }), back("denied"));
  if (!subjectsOf(access).includes(payload.s)) return deny("subject mismatch");
  const row = await first(app.db, "SELECT * FROM download_bundles WHERE id = ? AND subject = ?", String(payload.b), payload.s);
  if (!row || row.expires_at < now()) return deny("no such bundle");
  const wanted = parseJson(row.file_ids, []);
  const files = await filesWithBlobs(app.db, wanted.map((w) => w.f));
  const byId = new Map(files.map((f) => [f.id, f]));
  // Everything is checked again: still deliverable, still owned through the same entitlement, still stored. A bundle
  // spans few entitlements, so each is looked up once (a 2,000-file bundle stays far inside D1's queries per request).
  const ents = new Map();
  for (const e of new Set(wanted.map((w) => w.e))) ents.set(e, await usableEntitlement(app.db, access, e));
  for (const w of wanted) {
    const f = byId.get(w.f);
    const ent = ents.get(w.e);
    if (!f || !f.blob_key || !ent || ent.product_id !== f.product_id || !stillDelivered(f, ent.granted_at)) return deny("file or entitlement changed");
  }
  const ordered = wanted.map((w) => byId.get(w.f));
  const names = layout(ordered);
  const { length, stream } = zipStream(ordered.map((f, i) => ({
    name: names[i], size: f.size_bytes, crc32: f.crc32, open: async () => (await getFile(app.env, f.blob_key))?.body
  })));
  // Logged as served when the ZIP starts, like a single download: an interrupted download still counts (refund rule).
  await logServedMany(app, wanted.map((w) => ({ productId: byId.get(w.f).product_id, fileId: w.f, entitlementId: w.e, subject: payload.s })));
  const filename = `${part(ordered.length && new Set(ordered.map((f) => f.product_id)).size === 1 ? ordered[0].product_title : "AutoStacc")}.zip`;
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(length),
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer"
    }
  });
}

// Retention sweep: bundle links last minutes; their rows are kept a day for support, then removed.
export async function deleteExpiredBundles(db, nowMs = Date.now()) {
  const res = await run(db, "DELETE FROM download_bundles WHERE expires_at < ?", new Date(nowMs - 86400000).toISOString());
  return res.meta.changes || 0;
}

export const routes = [
  ["POST", "/api/downloads/bundle", issue, { impersonation: "allow" }],
  ["GET", "/api/downloads/bundle/:token", redeem, { auditReads: true }]
];

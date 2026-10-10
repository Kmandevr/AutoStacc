// Who may use the Pack Builder on what (docs/packs.md, Phase 5). Two scopes share every route handler:
//   admin  (/api/admin/packs)  AutoStacc's admins, on any Pac of any product; publishing always allowed (a held version
//                              published by an admin is an audited override).
//   studio (/api/studio/packs) a creator's owners and editors, on their own Studio products only (everything else is 404,
//                              like a route that doesn't exist); uploads count against the creator's file storage and
//                              publishing follows the automated review (review.js).
// A Studio product gets its own Stacclet and Pac the first time it's used (the creator never manages them by hand).
import { first, newId, now, parseJson } from "../lib/db.js";
import { fail, id } from "../lib/http.js";
import { requireAdmin, requireUser } from "../auth/session.js";
import { requireOwnProduct } from "../creators/products.js";
import { requireFeature } from "../lib/features.js";
import { getProduct } from "../catalog/products.js";
import { getVersion } from "./versions.js";
import { getUpload } from "./uploads.js";

const OWNER = /^[a-z0-9_]{1,48}$/;
const notFound = () => fail(404, "not_found", "Nothing here.");

// Whose stored originals a version uses: the project's creator, or AutoStacc for its own catalog. An id that can't be a
// storage scope is refused rather than folded into another owner's (stored originals are never shared across owners).
export async function ownerOf(db, product) {
  const p = product.project_id ? await first(db, "SELECT creator_id FROM projects WHERE id = ?", product.project_id) : null;
  if (!p || !p.creator_id) return "autostacc";
  if (!OWNER.test(p.creator_id)) fail(409, "unsupported_owner", "This product's creator can't store pack files yet.");
  return p.creator_id;
}

export const ADMIN = {
  name: "admin",
  prefix: "/api/admin/packs",
  async actor(app) {
    requireFeature(app, "packs.builder");
    return { user: await requireAdmin(app), admin: true, creator: null };
  },
  // Any product that includes the Pac.
  async product(app, actor, productId, pacId) {
    const product = await getProduct(app.db, id(productId, "productId"));
    if (!product || !parseJson(product.pacs, []).includes(pacId)) fail(400, "invalid_product", "That product doesn't include this Pac.");
    return { product, creator: null };
  },
  async version(app, actor, versionId) {
    const v = await getVersion(app.db, id(versionId, "versionId"));
    if (!v) notFound();
    return v;
  }
};

export const STUDIO = {
  name: "studio",
  prefix: "/api/studio/packs",
  async actor(app) {
    requireFeature(app, "packs.builder");
    return { user: await requireUser(app), admin: false };
  },
  async product(app, actor, productId) {
    const { product, creator } = await requireOwnProduct(app.db, id(productId, "productId"), actor.user);
    return { product, creator };
  },
  // A version is reachable only through a product the requester may edit.
  async version(app, actor, versionId) {
    const v = await getVersion(app.db, id(versionId, "versionId"));
    if (!v || !v.product_id) notFound();
    const { creator } = await requireOwnProduct(app.db, v.product_id, actor.user);
    actor.creator = creator;
    return v;
  }
};

/** The upload, through its version (so the same rules apply). */
export async function uploadFor(app, scope, actor, uploadId) {
  const u = await getUpload(app.db, id(uploadId, "uploadId"));
  if (!u) notFound();
  await scope.version(app, actor, u.version_id);
  return u;
}

/** A Studio product's own Pac, or null before its first upload. */
export async function studioPacOf(db, product) {
  const existing = parseJson(product.pacs, []);
  return existing.length ? first(db, "SELECT * FROM pacs WHERE id = ? AND deleted_at IS NULL", existing[0]) : null;
}

/** A Studio product's own Pac, made on first use (with its Stacclet) and set as the product's Pacs. */
export async function ensureStudioPac(db, product) {
  const had = await studioPacOf(db, product);
  if (had) return had;
  const t = now();
  const staccletId = newId("st");
  const pacId = newId("pc");
  await db.batch([
    db.prepare(`INSERT INTO stacclets (id, project_id, title, source, published, created_at, updated_at) VALUES (?, ?, ?, 'studio', 1, ?, ?)`)
      .bind(staccletId, product.project_id, product.title, t, t),
    db.prepare(`INSERT INTO pacs (id, stacclet_id, project_id, title, source, published, created_at, updated_at) VALUES (?, ?, ?, ?, 'studio', 1, ?, ?)`)
      .bind(pacId, staccletId, product.project_id, product.title, t, t),
    // Only if the product's Pacs are still what was read (two first uses at once make one Pac, not two; a Pac that was
    // deleted is replaced).
    db.prepare("UPDATE products SET pacs = json_array(?), updated_at = ? WHERE id = ? AND pacs = ?").bind(pacId, t, product.id, product.pacs)
  ]);
  const fresh = parseJson((await first(db, "SELECT pacs FROM products WHERE id = ?", product.id)).pacs, []);
  if (fresh[0] !== pacId) {
    // Lost the race: this call's Pac and Stacclet go; the winner's are used.
    await db.batch([db.prepare("UPDATE pacs SET deleted_at = ? WHERE id = ?").bind(t, pacId), db.prepare("UPDATE stacclets SET deleted_at = ?, published = 0 WHERE id = ?").bind(t, staccletId)]);
  }
  const pac = await first(db, "SELECT * FROM pacs WHERE id = ? AND deleted_at IS NULL", fresh[0]);
  if (!pac) fail(409, "try_again", "This product changed meanwhile. Try again.");
  return pac;
}

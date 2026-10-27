// Studio, "Needs you" (owner, 2026-10-27, #221): what in one creator's products is waiting on someone, gathered in one
// answer so the Studio's first screen says it instead of making people open each product. Drafts not on sale yet,
// Coming soon products and their day, files waiting for AutoStacc's check or refused, and Pac versions checked and
// waiting to be published, waiting for review or failed. Only for members who run products (roles.js "products");
// first-party creators' members included. Read-only: every item links to where it's fixed.
import { json } from "../lib/http.js";
import { all } from "../lib/db.js";
import { requireUser } from "../auth/session.js";
import { requireCreator } from "../creators/creators.js";
import { rolesFor } from "../creators/roles.js";

const OF_CREATOR = "p.source = 'studio' AND p.deleted_at IS NULL AND p.project_id IN (SELECT id FROM projects WHERE creator_id = ? AND deleted_at IS NULL)";
const LIMIT = 50;

export async function attentionOf(db, creatorId) {
  const [products, files, versions] = await Promise.all([
    all(db, `SELECT p.id, p.title, p.coming_soon_on, j.name AS project FROM products p JOIN projects j ON j.id = p.project_id
      WHERE ${OF_CREATOR} AND p.published = 0 ORDER BY p.coming_soon_on IS NULL, p.coming_soon_on, p.updated_at DESC LIMIT ${LIMIT}`, creatorId),
    all(db, `SELECT f.product_id, p.title, f.status, COUNT(*) AS n FROM product_files f JOIN products p ON p.id = f.product_id
      WHERE ${OF_CREATOR} AND f.active = 1 AND f.status IN ('pending', 'rejected') GROUP BY f.product_id, f.status LIMIT ${LIMIT}`, creatorId),
    // The newest version of each product, when it's one that waits on someone.
    all(db, `SELECT v.product_id, p.title, v.status FROM pac_versions v JOIN products p ON p.id = v.product_id
      WHERE ${OF_CREATOR} AND v.status IN ('ready', 'in_review', 'failed')
        AND v.created_at = (SELECT MAX(o.created_at) FROM pac_versions o WHERE o.product_id = v.product_id) LIMIT ${LIMIT}`, creatorId)
  ]);
  const items = [];
  const at = (id, section) => `#product=${encodeURIComponent(id)}&section=${section}`;
  for (const p of products) {
    items.push(p.coming_soon_on
      ? { kind: "coming_soon", productId: p.id, title: p.title, project: p.project, on: p.coming_soon_on, href: at(p.id, "release") }
      : { kind: "draft", productId: p.id, title: p.title, project: p.project, href: at(p.id, "release") });
  }
  for (const f of files) items.push({ kind: f.status === "pending" ? "file_review" : "file_refused", productId: f.product_id, title: f.title, count: f.n, href: at(f.product_id, "pacs") });
  for (const v of versions) items.push({ kind: `version_${v.status}`, productId: v.product_id, title: v.title, href: at(v.product_id, "pacs") });
  return items;
}

async function attention(app, { creatorId }) {
  const user = await requireUser(app);
  const { creator } = await requireCreator(app.db, creatorId, user, rolesFor("products"), { allowCatalog: true });
  return json({ items: await attentionOf(app.db, creator.id) }, 200, { "Cache-Control": "no-store" });
}

export const routes = [["GET", "/api/studio/creators/:creatorId/attention", attention]];

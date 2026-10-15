// Control Center, the community library (docs/builder.md, phase 8): every shared piece with its open reports, and the
// takedown: a removed piece leaves the library, its product goes off sale, and its images stop showing on the sites
// that installed it (sites/context.js only shows files of active or creator-deleted pieces); a piece its creator already
// deleted can be taken down too. Restoring puts back its status and, if it was on sale and is still ready, its product.
// Takedowns and restores are audited; reports are marked resolved.
import { json, readJson, fail, str } from "../lib/http.js";
import { all, first, run, now } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { setStatus, takeDown } from "./pieces.js";
import { getCreator, getProject } from "../creators/creators.js";
import { updateProduct } from "../creators/products.js";

async function list(app) {
  await requireAdmin(app);
  const rows = await all(app.db, `SELECT p.id, p.kind, p.title, p.description, p.status, p.price_cents, p.product_id, p.installs, p.removed_note, p.created_at,
      c.name AS creator_name, c.slug AS creator_slug,
      (SELECT COUNT(*) FROM library_reports r WHERE r.piece_id = p.id AND r.resolved_at IS NULL) AS open_reports,
      (SELECT json_group_array(r.reason) FROM (SELECT reason FROM library_reports r WHERE r.piece_id = p.id AND r.resolved_at IS NULL ORDER BY r.created_at DESC LIMIT 5) r) AS reasons
    FROM library_pieces p JOIN creators c ON c.id = p.creator_id
    ORDER BY open_reports DESC, p.created_at DESC LIMIT 300`);
  return json({ pieces: rows.map((p) => ({ id: p.id, kind: p.kind, title: p.title, description: p.description, status: p.status, priceCents: p.price_cents,
    productId: p.product_id, installs: p.installs, note: p.removed_note, createdAt: p.created_at, creator: { name: p.creator_name, path: `/${p.creator_slug}` },
    openReports: p.open_reports, reasons: JSON.parse(p.reasons || "[]") })) });
}

async function change(app, { pieceId }) {
  await requireAdmin(app);
  const body = await readJson(app.request);
  if (!["removed", "active"].includes(body.status)) fail(400, "invalid_field", "status must be removed or active.", { field: "status" });
  const piece = await first(app.db, "SELECT * FROM library_pieces WHERE id = ?", pieceId);
  if (!piece) fail(404, "not_found", "No such piece.");
  const note = body.note ? str(body.note, "note", { max: 300 }) : null;
  const product = piece.product_id ? await first(app.db, "SELECT * FROM products WHERE id = ?", piece.product_id) : null;
  const ctx = product ? { product, project: await getProject(app.db, product.project_id), creator: await getCreator(app.db, piece.creator_id) } : null;
  if (body.status === "removed") {
    // Works on a piece its creator deleted too, so deleting can't dodge a takedown. Its product goes off sale.
    if (piece.status === "removed") fail(409, "already_removed", "Already taken down.");
    await takeDown(app.db, piece, note, product && product.published);
    if (ctx && product.published) await updateProduct(app.db, { ...ctx, input: { published: false } });
    await run(app.db, "UPDATE library_reports SET resolved_at = ? WHERE piece_id = ? AND resolved_at IS NULL", now(), piece.id);
  } else {
    // Back to what it was; its product back on sale only if it was, and only if it is still ready (readiness checks).
    if (piece.status !== "removed") fail(409, "not_removed", "This piece isn't taken down.");
    await setStatus(app.db, piece.id, piece.removed_from || "active");
    if (ctx && piece.product_was_live && (piece.removed_from || "active") === "active" && ctx.creator) {
      await updateProduct(app.db, { ...ctx, input: { published: true } }).catch(() => {});
    }
  }
  await audit(app, body.status === "removed" ? "library.removed" : "library.restored", { targetType: "library_piece", targetId: piece.id, detail: { note } });
  return json({ ok: true });
}

export const routes = [
  ["GET", "/api/admin/library", list],
  ["PATCH", "/api/admin/library/:pieceId", change]
];

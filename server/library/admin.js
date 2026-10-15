// Control Center, the community library (docs/builder.md, phase 8): every shared piece with its open reports, and the
// takedown: a removed piece leaves the library, its product goes off sale, and its images stop showing on the sites
// that installed it (sites/context.js only shows files of active or creator-deleted pieces). Restoring lists it again.
// Takedowns and restores are audited; reports are marked resolved.
import { json, readJson, fail, str } from "../lib/http.js";
import { all, first, run, now } from "../lib/db.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { setStatus } from "./pieces.js";

async function list(app) {
  await requireAdmin(app);
  const rows = await all(app.db, `SELECT p.id, p.kind, p.title, p.description, p.status, p.price_cents, p.product_id, p.installs, p.removed_note, p.created_at,
      c.name AS creator_name, c.slug AS creator_slug,
      (SELECT COUNT(*) FROM library_reports r WHERE r.piece_id = p.id AND r.resolved_at IS NULL) AS open_reports,
      (SELECT json_group_array(r.reason) FROM (SELECT reason FROM library_reports r WHERE r.piece_id = p.id AND r.resolved_at IS NULL ORDER BY r.created_at DESC LIMIT 5) r) AS reasons
    FROM library_pieces p JOIN creators c ON c.id = p.creator_id WHERE p.status <> 'deleted'
    ORDER BY open_reports DESC, p.created_at DESC LIMIT 300`);
  return json({ pieces: rows.map((p) => ({ id: p.id, kind: p.kind, title: p.title, description: p.description, status: p.status, priceCents: p.price_cents,
    productId: p.product_id, installs: p.installs, note: p.removed_note, createdAt: p.created_at, creator: { name: p.creator_name, path: `/${p.creator_slug}` },
    openReports: p.open_reports, reasons: JSON.parse(p.reasons || "[]") })) });
}

async function change(app, { pieceId }) {
  await requireAdmin(app);
  const body = await readJson(app.request);
  if (!["removed", "active"].includes(body.status)) fail(400, "invalid_field", "status must be removed or active.", { field: "status" });
  const piece = await first(app.db, "SELECT id, status, product_id FROM library_pieces WHERE id = ? AND status <> 'deleted'", pieceId);
  if (!piece) fail(404, "not_found", "No such piece.");
  const note = body.note ? str(body.note, "note", { max: 300 }) : null;
  await setStatus(app.db, piece.id, body.status, body.status === "removed" ? note : null);
  // Its product follows: off sale while removed, back on sale when restored (buyers keep what they own either way).
  if (piece.product_id) await run(app.db, "UPDATE products SET published = ?, updated_at = ? WHERE id = ? AND source = 'studio'", body.status === "active" ? 1 : 0, now(), piece.product_id);
  if (body.status === "removed") await run(app.db, "UPDATE library_reports SET resolved_at = ? WHERE piece_id = ? AND resolved_at IS NULL", now(), piece.id);
  await audit(app, body.status === "removed" ? "library.removed" : "library.restored", { targetType: "library_piece", targetId: piece.id, detail: { note } });
  return json({ ok: true });
}

export const routes = [
  ["GET", "/api/admin/library", list],
  ["PATCH", "/api/admin/library/:pieceId", change]
];

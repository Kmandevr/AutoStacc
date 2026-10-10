// A product's release history (D1 product_events, docs/studio.md): every publish, pause, price change, sale and Pac
// version step, with who did it. Other modules record through these functions, never their own SQL. Detail is a small
// object of counts, prices or ids, never emails. Read by the Product Studio's Overview and Release sections.
import { all, first, run, stmt, newId, now, parseJson } from "../lib/db.js";

// Kinds a product event can have; anything else is a programming error.
export const EVENT_KINDS = new Set([
  "created", "edited", "published", "unpublished", "paused", "resumed", "removed", "restored", "price_changed",
  "sale_created", "sale_ended", "file_added", "file_removed", "preview_changed",
  "pac_created", "pac_version_submitted", "pac_version_approved", "pac_version_refused", "pac_version_published", "pac_version_discarded"
]);

const SQL = "INSERT INTO product_events (id, product_id, kind, actor_user_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)";

function args({ productId, kind, actorId = null, detail = {} }) {
  if (!EVENT_KINDS.has(kind)) throw new Error(`unknown product event: ${kind}`);
  return [newId("pe"), productId, kind, actorId, JSON.stringify(detail || {}), now()];
}

/** The insert as a statement, for a caller's own batch (so the event lands with the change or not at all). */
export const eventStmt = (db, event) => stmt(db, SQL, ...args(event));

/** Records one event on its own. */
export const recordEvent = (db, event) => run(db, SQL, ...args(event));

// Saved edits by the same account within this window become one "edited" event (the Studio autosaves while typing).
const EDIT_WINDOW_MS = 15 * 60000;

/** Records that fields were edited, merged into the latest event when that is the same person's edit a moment ago. */
export async function recordEdit(db, { productId, actorId = null, fields }) {
  const last = await first(db, "SELECT id, kind, actor_user_id, detail, created_at FROM product_events WHERE product_id = ? ORDER BY created_at DESC, id DESC LIMIT 1", productId);
  if (last && last.kind === "edited" && last.actor_user_id === actorId && Date.parse(last.created_at) > Date.now() - EDIT_WINDOW_MS) {
    const merged = [...new Set([...(parseJson(last.detail, {}).fields || []), ...fields])];
    return run(db, "UPDATE product_events SET detail = ?, created_at = ? WHERE id = ?", JSON.stringify({ fields: merged }), now(), last.id);
  }
  return recordEvent(db, { productId, kind: "edited", actorId, detail: { fields } });
}

/** A product's history, newest first. */
export async function listEvents(db, productId, limit = 50) {
  const rows = await all(db, "SELECT id, kind, actor_user_id, detail, created_at FROM product_events WHERE product_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    productId, Math.max(1, Math.min(200, limit | 0)));
  return rows.map((r) => ({ id: r.id, kind: r.kind, actorId: r.actor_user_id, detail: parseJson(r.detail, {}), at: r.created_at }));
}

/** On account deletion: keep the history, forget who it was. */
export const forgetActorStmt = (db, userId) => stmt(db, "UPDATE product_events SET actor_user_id = NULL WHERE actor_user_id = ?", userId);

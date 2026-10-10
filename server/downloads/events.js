// Shared by single and bundle downloads: whose link a download is (a subject) and the download log (D1
// download_events), which statistics and the refund rule read (a product with a served file isn't refunded silently).
import { run, newId, now } from "../lib/db.js";
import { impersonationIdOf } from "../auth/session.js";

// impersonation_id marks downloads an admin made while impersonating, so they never count as the customer's.
export const logEvent = (app, event, f) =>
  run(app.db, `INSERT INTO download_events (id, event, product_id, file_id, entitlement_id, subject, reason, created_at, impersonation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId("dl"), event, f.productId || null, f.fileId || null, f.entitlementId || null, f.subject || null, f.reason || null, now(), impersonationIdOf(app));

// Which of the requester's identities an entitlement belongs to (accounts first).
export function subjectFor(access, ent) {
  if (access.user && (ent.user_id === access.user.id || (!ent.user_id && ent.email === String(access.user.email).toLowerCase()))) return `u:${access.user.id}`;
  if (ent.source_type === "purchase" && access.guestOrderIds.includes(ent.source_id)) return `g:${ent.source_id}`;
  return null;
}


// Many served files at once (a bundle), in one statement.
export const logServedMany = (app, rows) =>
  run(app.db, `INSERT INTO download_events (id, event, product_id, file_id, entitlement_id, subject, reason, created_at, impersonation_id)
    SELECT j.value->>'id', 'served', j.value->>'p', j.value->>'f', j.value->>'e', ?, 'bundle', ?, ? FROM json_each(?) j`,
    rows[0]?.subject || null, now(), impersonationIdOf(app), JSON.stringify(rows.map((r) => ({ id: newId("dl"), p: r.productId, f: r.fileId, e: r.entitlementId }))));

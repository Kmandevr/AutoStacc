// Entitlements: who owns which product, independent of how they got it (purchase, free claim, promo, manual grant,
// bundle, subscription, replacement). Ownership checks only ever read this table, never orders.
import { all, first, stmt, run, newId, now } from "../lib/db.js";

const ACTIVE = "e.status = 'active' AND (e.expires_at IS NULL OR e.expires_at > ?)";

// Insert-if-absent, as a statement so callers can batch it. The unique key (product, source, email) makes replays harmless.
export function grantStmt(db, { userId = null, email, productId, sourceType, sourceId, note = null, expiresAt = null }) {
  return stmt(db,
    `INSERT INTO entitlements (id, user_id, email, product_id, source_type, source_id, status, granted_at, expires_at, note)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
     ON CONFLICT (product_id, source_type, source_id, email) DO NOTHING`,
    newId("ent"), userId, email.toLowerCase(), productId, sourceType, sourceId, now(), expiresAt, note);
}

export const grant = (db, g) => grantStmt(db, g).run();

export const revokeBySource = (db, sourceType, sourceId, reason) =>
  run(db, `UPDATE entitlements SET status = 'revoked', revoked_at = ?, revoke_reason = ?
           WHERE source_type = ? AND source_id = ? AND status = 'active'`, now(), reason, sourceType, sourceId);

// Undo a revocation with a given reason (e.g. a chargeback that was won), leaving other revocations alone.
export const restoreBySource = (db, sourceType, sourceId, reason) =>
  run(db, `UPDATE entitlements SET status = 'active', revoked_at = NULL, revoke_reason = NULL
           WHERE source_type = ? AND source_id = ? AND status = 'revoked' AND revoke_reason = ?`, sourceType, sourceId, reason);

export const revokeById = (db, id, reason) =>
  run(db, "UPDATE entitlements SET status = 'revoked', revoked_at = ?, revoke_reason = ? WHERE id = ? AND status = 'active'", now(), reason, id);

// SQL condition + params for "entitlements this requester may use": a verified account (by id, or by its email for
// grants not yet linked) and/or guest order keys (only that order's purchases).
function accessClause(access) {
  const parts = [], params = [];
  if (access.user) {
    parts.push("e.user_id = ?", "(e.user_id IS NULL AND e.email = ?)");
    params.push(access.user.id, String(access.user.email).toLowerCase());
  }
  if (access.guestOrderIds && access.guestOrderIds.length) {
    parts.push(`(e.source_type = 'purchase' AND e.source_id IN (${access.guestOrderIds.map(() => "?").join(",")}))`);
    params.push(...access.guestOrderIds);
  }
  return parts.length ? { sql: `(${parts.join(" OR ")})`, params } : null;
}

export async function activeEntitlements(db, access, productId) {
  const c = accessClause(access);
  if (!c) return [];
  return all(db,
    `SELECT e.* FROM entitlements e WHERE ${ACTIVE} AND ${c.sql} ${productId ? "AND e.product_id = ?" : ""} ORDER BY e.granted_at`,
    now(), ...c.params, ...(productId ? [productId] : []));
}

export async function ownedProductIds(db, access) {
  return [...new Set((await activeEntitlements(db, access)).map((e) => e.product_id))];
}

// One specific entitlement, only if this requester may use it right now.
export async function usableEntitlement(db, access, entitlementId) {
  const c = accessClause(access);
  if (!c) return null;
  return first(db, `SELECT e.* FROM entitlements e WHERE e.id = ? AND ${ACTIVE} AND ${c.sql}`, entitlementId, now(), ...c.params);
}

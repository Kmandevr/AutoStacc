// The admin audit log (table admin_audit, append-only by trigger): who did what, to whom, during which impersonation.
// The actor always comes from the request's real session (app._actor, set by server/auth/session.js), never from
// input, so an action taken while impersonating names the admin, not the customer. detail is kept small and stripped
// of anything secret-shaped; customer emails stay out (subject_user_id identifies the customer).
import { run, newId, now } from "../lib/db.js";

const SECRET_KEY = /pass|token|secret|key|card|cookie|session|auth|hash|email/i;
const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g;
// Free text (an admin's note, a reason) may mention someone's email; the log keeps the words, never the address.
const scrub = (s) => s.replace(EMAIL, "[email]");
const MAX_DETAIL = 2000;

// Drops secret-looking keys and long values; keeps numbers, booleans and short strings.
export function cleanDetail(detail = {}) {
  const out = {};
  for (const [k, v] of Object.entries(detail || {})) {
    if (SECRET_KEY.test(k) || v === undefined) continue;
    if (v === null || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = scrub(v).slice(0, 200);
    else if (Array.isArray(v)) out[k] = v.slice(0, 20).map((x) => (typeof x === "string" ? scrub(x).slice(0, 80) : x)).filter((x) => typeof x !== "object");
  }
  const text = JSON.stringify(out);
  return text.length > MAX_DETAIL ? JSON.stringify({ truncated: true }) : text;
}

// The person behind this request, for the log: the admin (with the impersonation, if any) or a signed-in customer.
export function actorOf(app) {
  const a = app._actor;
  if (!a) return { userId: null, label: "anonymous", impersonationId: null, subjectUserId: null };
  return { userId: a.userId, label: a.label, impersonationId: a.impersonationId || null, subjectUserId: a.subjectUserId || null };
}

export async function audit(app, action, { targetType = null, targetId = null, subjectUserId, detail } = {}) {
  const actor = actorOf(app);
  await run(app.db,
    `INSERT INTO admin_audit (id, at, action, actor_user_id, actor_label, impersonation_id, subject_user_id, target_type, target_id, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId("au"), now(), action, actor.userId, actor.label, actor.impersonationId,
    subjectUserId === undefined ? actor.subjectUserId : subjectUserId, targetType, targetId === null ? null : String(targetId).slice(0, 80), cleanDetail(detail));
}

// For hooks that run outside a request we built (Better Auth's session hook): an explicit actor.
export async function auditAs(db, actor, action, fields = {}) {
  return audit({ db, _actor: actor }, action, fields);
}

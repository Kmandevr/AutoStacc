// Support impersonation (docs/admin.md): an admin, still signed in as themselves, sees the store as one customer.
// The browser holds only a random token (httpOnly cookie gs_impersonation); the server keeps its hash and decides
// everything else on every request: the row must be open, unexpired, recently used, started by this same admin with
// this same Better Auth session, the admin must still be an admin and the customer must exist and not be one.
// Anything else ends the row and makes the request "stale" (fails closed) until the admin exits explicitly.
import { first, run, newId, now, randomToken } from "../lib/db.js";
import { sha256 } from "../lib/crypto.js";
import { isAdmin } from "../auth/roles.js";
import { auditAs } from "../audit/log.js";

const COOKIE = "gs_impersonation";
const TOKEN = /^[a-z2-7]{52}$/;
export const IDLE_MINUTES = 30;
export const MAX_MINUTES = 120;
const TOUCH_SECONDS = 60;

export function tokenFrom(request) {
  const raw = (request.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return "";
  // A mangled value still counts as "a cookie is present" (so it fails closed), never as a crash.
  try {
    return decodeURIComponent(raw.slice(COOKIE.length + 1)) || "invalid";
  } catch {
    return "invalid";
  }
}

// The banner's once-a-minute check (js/impersonation.js) says so, and doesn't count as activity: otherwise an open
// tab would keep an idle impersonation alive until its hard limit.
const isBannerPoll = (request) => request.headers.get("x-impersonation-poll") === "1";
export const hasImpersonationCookie = (request) => Boolean(tokenFrom(request));

const cookie = (config, value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secure ? "; Secure" : ""}`;
export const clearCookie = (config) => cookie(config, "", 0);

// A user row as Better Auth would give it (role as stored), or null.
export async function userById(db, userId) {
  const u = await first(db, 'SELECT id, name, email, "emailVerified" AS emailVerified, role, "createdAt" AS createdAt FROM "user" WHERE id = ?', userId);
  return u ? { ...u, emailVerified: Boolean(u.emailVerified) } : null;
}
// The customer as the rest of the store sees them while impersonated: forced to role "customer", marked impersonated.
export const asImpersonated = (user) => ({ ...user, role: "customer", impersonated: true });

const adminActor = (admin, row) => ({ userId: admin ? admin.id : row.admin_user_id, label: admin ? admin.email : `admin ${row.admin_user_id}`, impersonationId: row.id, subjectUserId: row.customer_user_id });

async function endRow(db, row, reason, admin) {
  const res = await run(db, "UPDATE impersonations SET ended_at = ?, end_reason = ? WHERE id = ? AND ended_at IS NULL", now(), reason, row.id);
  if (res.meta.changes) await auditAs(db, adminActor(admin, row), "impersonation.ended", { targetType: "user", targetId: row.customer_user_id, detail: { reason } });
}

// Opens an impersonation for the admin's current session (closing any other one that session had open).
export async function startImpersonation(app, { admin, sessionId, customer, purpose, note }) {
  const open = await first(app.db, "SELECT * FROM impersonations WHERE admin_session_id = ? AND ended_at IS NULL", sessionId);
  if (open) await endRow(app.db, open, "replaced", admin);
  const token = randomToken(32);
  const id = newId("imp");
  const started = now();
  const expires = new Date(Date.parse(started) + MAX_MINUTES * 60000).toISOString();
  await run(app.db,
    `INSERT INTO impersonations (id, token_hash, admin_user_id, admin_session_id, customer_user_id, purpose, note, started_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, await sha256(token), admin.id, sessionId, customer.id, purpose, note || null, started, started, expires);
  await auditAs(app.db, adminActor(admin, { id, customer_user_id: customer.id }), "impersonation.started",
    { targetType: "user", targetId: customer.id, detail: { purpose, note: note || null } });
  return { id, expiresAt: expires, setCookie: cookie(app.config, token, MAX_MINUTES * 60) };
}

// What this request's cookie means, given who is really signed in. null = no cookie (a normal request).
export async function resolveImpersonation(app, realUser, realSession) {
  const token = tokenFrom(app.request);
  if (!token) return null;
  const row = TOKEN.test(token) ? await first(app.db, "SELECT * FROM impersonations WHERE token_hash = ?", await sha256(token)) : null;
  const stale = async (reason) => {
    if (row && !row.ended_at) await endRow(app.db, row, reason, isAdmin(app, realUser) && realUser.id === row.admin_user_id ? realUser : null);
    return { stale: true, reason: row && row.ended_at ? row.end_reason || "ended" : reason };
  };
  if (!row || row.ended_at) return stale("ended");
  if (!realUser || !realSession) return stale("admin signed out");
  if (realUser.id !== row.admin_user_id || realSession.id !== row.admin_session_id) return stale("different session");
  if (!isAdmin(app, realUser)) return stale("not an admin");
  const t = Date.now();
  if (t >= Date.parse(row.expires_at)) return stale("time limit");
  if (t - Date.parse(row.last_seen_at) > IDLE_MINUTES * 60000) return stale("idle");
  const target = await userById(app.db, row.customer_user_id);
  if (!target) return stale("customer gone");
  if (isAdmin(app, target)) return stale("customer is an admin");
  const customer = asImpersonated(target);
  if (!isBannerPoll(app.request) && t - Date.parse(row.last_seen_at) > TOUCH_SECONDS * 1000) await run(app.db, "UPDATE impersonations SET last_seen_at = ? WHERE id = ? AND ended_at IS NULL", now(), row.id);
  return { id: row.id, purpose: row.purpose, admin: realUser, customer, startedAt: row.started_at, expiresAt: row.expires_at, idleMinutes: IDLE_MINUTES };
}

// Exit: whoever holds the cookie may close it (it only ever narrows access). Always clears the cookie.
export async function endImpersonation(app, realUser) {
  const token = tokenFrom(app.request);
  const row = TOKEN.test(token) ? await first(app.db, "SELECT * FROM impersonations WHERE token_hash = ?", await sha256(token)) : null;
  if (row && !row.ended_at) await endRow(app.db, row, "exited", realUser && realUser.id === row.admin_user_id ? realUser : null);
  return { ended: Boolean(row), setCookie: clearCookie(app.config) };
}

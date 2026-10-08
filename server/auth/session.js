// Who is asking: the signed-in user (from the Better Auth session cookie), and guards for routes that need one.
// During a support impersonation (server/impersonation/sessions.js) the user every route sees is the customer, while
// app._actor keeps the real admin for the audit log; a stale impersonation makes the request signed out (fails closed).
import { fail } from "../lib/http.js";
import { createAuth } from "./index.js";
import { isAdmin } from "./roles.js";
import { resolveImpersonation } from "../impersonation/sessions.js";

export { isAdmin };

// The real Better Auth session, whatever the impersonation cookie says. Cached per request.
export async function realSession(app) {
  if (app._real !== undefined) return app._real;
  const s = await createAuth(app).api.getSession({ headers: app.request.headers }).catch(() => null);
  app._real = s && s.user ? { user: s.user, session: s.session } : null;
  return app._real;
}

// The impersonation this request is in: null (none), { stale, reason } or the open impersonation. Cached per request.
export async function impersonation(app) {
  if (app._imp !== undefined) return app._imp;
  const real = await realSession(app);
  app._imp = await resolveImpersonation(app, real && real.user, real && real.session);
  return app._imp;
}

// Cached on the request context so several guards in one request read the session once.
export async function currentUser(app) {
  if (app._user !== undefined) return app._user;
  const real = await realSession(app);
  const imp = await impersonation(app);
  if (imp && imp.stale) {
    app._user = null;
    app._actor = real ? { userId: real.user.id, label: real.user.email } : null;
  } else if (imp) {
    app._user = imp.customer;
    app._actor = { userId: imp.admin.id, label: imp.admin.email, impersonationId: imp.id, subjectUserId: imp.customer.id };
  } else {
    app._user = real ? real.user : null;
    app._actor = real ? { userId: real.user.id, label: real.user.email } : null;
  }
  return app._user;
}

// The impersonation this request ran in (after currentUser), for records that must not pass as the customer's own.
export const impersonationIdOf = (app) => (app._actor && app._actor.impersonationId) || null;

export async function requireUser(app) {
  const user = await currentUser(app);
  if (!user) fail(401, "unauthenticated", "Log in to do that.");
  if (!user.emailVerified) fail(403, "email_unverified", "Confirm your email first.");
  return user;
}

export async function requireAdmin(app) {
  const user = await currentUser(app);
  // Same answer as a missing route, for strangers and customers alike, so the admin API doesn't advertise itself.
  // An impersonated customer is a customer here too (isAdmin is false for them), so admin routes vanish meanwhile.
  if (!isAdmin(app, user)) fail(404, "not_found", "Nothing here.");
  return user;
}

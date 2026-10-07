// Who is asking: the signed-in user (from the Better Auth session cookie), and guards for routes that need one.
import { fail } from "../lib/http.js";
import { createAuth } from "./index.js";

// Cached on the request context so several guards in one request read the session once.
export async function currentUser(app) {
  if (app._user !== undefined) return app._user;
  const session = await createAuth(app).api.getSession({ headers: app.request.headers }).catch(() => null);
  app._user = session && session.user ? session.user : null;
  return app._user;
}

export async function requireUser(app) {
  const user = await currentUser(app);
  if (!user) fail(401, "unauthenticated", "Log in to do that.");
  if (!user.emailVerified) fail(403, "email_unverified", "Confirm your email first.");
  return user;
}

export const isAdmin = (app, user) =>
  Boolean(user && user.emailVerified && (user.role === "admin" || app.config.adminEmails.has(String(user.email).toLowerCase())));

export async function requireAdmin(app) {
  const user = await requireUser(app);
  // Same answer as a missing route, so the admin API doesn't advertise itself.
  if (!isAdmin(app, user)) fail(404, "not_found", "Nothing here.");
  return user;
}

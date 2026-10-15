// GET /api/account/two-factor: whether Settings › Security offers two-step sign-in to this account, and whether it's
// on. Only with the feature switch auth.adminTwoFactor on, and only for an admin (or someone who still has it on after
// losing the role, so they can turn it off); everyone else gets 404 like a route that doesn't exist. Setting it up,
// the sign-in code step and turning it off are Better Auth's /api/auth/two-factor/* (server/auth/two-factor.js).
import { json, fail } from "../lib/http.js";
import { requireUser, isAdmin, impersonationIdOf } from "../auth/session.js";
import { requireFeature } from "../lib/features.js";
import { twoFactorEnabled } from "../auth/two-factor-state.js";

async function status(app) {
  requireFeature(app, "auth.adminTwoFactor");
  const user = await requireUser(app);
  if (impersonationIdOf(app)) fail(404, "not_found", "Not found.");
  const enabled = await twoFactorEnabled(app.db, user.id);
  if (!enabled && !isAdmin(app, user)) fail(404, "not_found", "Not found.");
  return json({ enabled });
}

export const routes = [["GET", "/api/account/two-factor", status]];

// The impersonation policy, applied by server/app.js to every API request that carries the impersonation cookie.
// Reads are the customer's own (routes see only the customer). Writes are refused unless the route opts in with
// { impersonation: "allow" } or, for payments, "test-payments" (refused whenever the provider is live). Better Auth's
// endpoints (password, profile, sign-in, sign-out) are refused outright: they would act on the admin's own account.
// A stale impersonation fails every request except the account check and exit, so it can't silently fall back to
// the admin's own session while the browser still looks like the customer. Every allowed write, and reads a route
// marks { auditReads: true }, is written to the audit log under the admin's name first.
import { fail } from "../lib/http.js";
import { hasImpersonationCookie } from "./sessions.js";
import { impersonation, currentUser } from "../auth/session.js";
import { paymentProvider } from "../payments/index.js";
import { audit } from "../audit/log.js";

const READS = new Set(["GET", "HEAD"]);

// null = no impersonation cookie (normal request); otherwise the open impersonation (or a thrown refusal).
export async function impersonationGate(app, { auth, route }) {
  // Provider webhooks (opts.external) are authenticated by their signature and never act as anyone: a cookie is noise.
  if (!hasImpersonationCookie(app.request) || (route && route.opts.external)) return null;
  const imp = await impersonation(app);
  await currentUser(app);
  const opts = (route && route.opts) || {};
  if (opts.impersonation === "exit") return null;
  if (imp.stale) {
    if (opts.whenStale) return null;
    fail(401, "impersonation_ended", "The impersonation has ended. Exit it to return to the admin panel.", { reason: imp.reason });
  }
  if (auth) fail(403, "impersonation_blocked", "Sign-in, password and profile changes aren't available while impersonating. Exit impersonation first.");
  if (!route || READS.has(app.request.method)) return imp;
  if (!opts.impersonation) fail(403, "impersonation_blocked", "That isn't available while impersonating a customer. Exit impersonation first.");
  if (opts.impersonation === "test-payments" && paymentProvider(app).livemode(app.config)) {
    fail(403, "impersonation_live_payment", "Payments are never made while impersonating in a live store. Test purchases run in a test environment.");
  }
  return imp;
}

// Runs an allowed request inside an open impersonation, recording it before it runs (so it can't happen unrecorded)
// and recording a failure after. Route patterns only: tokens in paths (download links) never reach the log.
export async function auditImpersonated(app, imp, route, handler) {
  const method = app.request.method;
  if (READS.has(method) && !route.opts.auditReads) return handler();
  const target = `${method} ${route.pattern}`;
  await audit(app, "impersonation.request", { targetType: "route", targetId: target });
  try {
    return await handler();
  } catch (e) {
    await audit(app, "impersonation.request_failed", { targetType: "route", targetId: target, detail: { status: e.status || 500, code: e.code || "error" } }).catch(() => {});
    throw e;
  }
}

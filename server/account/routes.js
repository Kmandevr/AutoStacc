// GET /api/account: who is signed in (if anyone), for the header, account page and library. Profile edits, password
// changes and sign-out are Better Auth endpoints under /api/auth/*. While an admin impersonates a customer, "user" is
// the customer and "impersonation" says so (every page's banner reads it, js/account-nav.js); it still answers when
// the impersonation has gone stale, so the banner can say it ended instead of the page quietly changing identity.
import { json } from "../lib/http.js";
import { currentUser, isAdmin, impersonation } from "../auth/session.js";
import { guestOrderIds } from "../orders/guest.js";
import { paymentProvider } from "../payments/index.js";

function impersonationView(imp) {
  if (!imp) return null;
  if (imp.stale) return { active: false, ended: true, reason: imp.reason };
  return {
    active: true, purpose: imp.purpose, startedAt: imp.startedAt, expiresAt: imp.expiresAt, idleMinutes: imp.idleMinutes,
    customer: { email: imp.customer.email, name: imp.customer.name }, admin: { email: imp.admin.email }
  };
}

async function me(app) {
  const user = await currentUser(app);
  const live = paymentProvider(app).livemode(app.config);
  return json({
    user: user ? { id: user.id, name: user.name, email: user.email, emailVerified: Boolean(user.emailVerified), createdAt: user.createdAt, admin: isAdmin(app, user) } : null,
    guestOrders: (await guestOrderIds(app)).length,
    impersonation: impersonationView(await impersonation(app)),
    store: { paymentProvider: app.config.paymentProvider, testMode: !app.config.production, livePayments: live }
  });
}

export const routes = [["GET", "/api/account", me, { whenStale: true }]];

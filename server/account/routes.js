// GET /api/account: who is signed in (if anyone), for the header, account page and library. Profile edits, password
// changes and sign-out are Better Auth endpoints under /api/auth/*.
import { json } from "../lib/http.js";
import { currentUser, isAdmin } from "../auth/session.js";
import { guestOrderIds } from "../orders/guest.js";

async function me(app) {
  const user = await currentUser(app);
  return json({
    user: user ? { id: user.id, name: user.name, email: user.email, emailVerified: Boolean(user.emailVerified), createdAt: user.createdAt, admin: isAdmin(app, user) } : null,
    guestOrders: (await guestOrderIds(app)).length,
    store: { paymentProvider: app.config.paymentProvider, testMode: !app.config.production }
  });
}

export const routes = [["GET", "/api/account", me]];

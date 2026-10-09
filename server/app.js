// Entry point of the store API (Cloudflare Pages Functions call it for /api/*). Loads config, hands /api/auth/* to
// Better Auth, checks the origin of state-changing requests, applies the impersonation policy, then dispatches to the
// module that owns the route. Each module (catalog, cart, checkout, orders, payments, entitlements, downloads, account,
// admin, analytics, projects, polls, impersonation, audit, stats, promotions, studio, newsletter, dev) exports its own route table;
// adding a feature is one import and one line below. Creators' public pages are not API routes: functions/[[path]].js.
import { loadConfig, ConfigError } from "./lib/config.js";
import { createRouter } from "./lib/router.js";
import { json, errorResponse, assertSameOrigin, HttpError } from "./lib/http.js";
import { createAuth } from "./auth/index.js";
import { routes as catalog } from "./catalog/routes.js";
import { routes as cart } from "./cart/routes.js";
import { routes as checkout } from "./checkout/routes.js";
import { routes as orders } from "./orders/routes.js";
import { routes as payments } from "./payments/routes.js";
import { routes as library } from "./entitlements/routes.js";
import { routes as downloads } from "./downloads/routes.js";
import { routes as account } from "./account/routes.js";
import { routes as accountSettings } from "./account/settings.js";
import { routes as accountExport } from "./account/export.js";
import { routes as accountDelete } from "./account/delete.js";
import { routes as admin } from "./admin/routes.js";
import { routes as analytics } from "./analytics/routes.js";
import { routes as dev } from "./dev/routes.js";
import { routes as projects } from "./projects/routes.js";
import { routes as polls } from "./polls/routes.js";
import { routes as impersonation } from "./impersonation/routes.js";
import { routes as testPurchases } from "./admin/test-purchases.js";
import { routes as customerPreview } from "./admin/customers.js";
import { routes as audit } from "./audit/routes.js";
import { routes as stats } from "./stats/routes.js";
import { routes as promotions } from "./promotions/routes.js";
import { routes as studioCreators } from "./studio/creators.js";
import { routes as studioSites } from "./studio/sites.js";
import { routes as studioProducts } from "./studio/products.js";
import { routes as studioProductFiles } from "./studio/product-files.js";
import { routes as studioEarnings } from "./studio/earnings.js";
import { routes as studioPayoutAccount } from "./studio/payout-account.js";
import { routes as adminPayouts } from "./admin/payouts.js";
import { routes as adminCreators } from "./admin/creators.js";
import { routes as adminFiles } from "./admin/files.js";
import { routes as newsletter } from "./newsletter/routes.js";
import { impersonationGate, auditImpersonated } from "./impersonation/policy.js";

const router = createRouter([catalog, cart, checkout, orders, payments, library, downloads, account, accountSettings, accountExport, accountDelete, admin, analytics, projects, polls,
  impersonation, testPurchases, customerPreview, audit, stats, promotions, studioCreators, studioSites, studioProducts, studioProductFiles, studioEarnings, studioPayoutAccount, adminCreators, adminPayouts, adminFiles, newsletter, dev]);

export async function handleApi(request, env, ctx) {
  const path = new URL(request.url).pathname;
  let config;
  try {
    config = loadConfig(env);
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    console.error(e.message);
    return json({ error: { code: "store_offline", message: "The store is offline for maintenance. The music isn't." } }, 503, { "Retry-After": "600" });
  }
  const app = { env, config, ctx, request, db: env.DB };
  try {
    const auth = path.startsWith("/api/auth/");
    const match = auth ? null : router.match(request.method, path);
    // While an impersonation cookie is present, decide before anything runs (server/impersonation/policy.js).
    const gate = await impersonationGate(app, { auth, route: match && match.route });
    if (auth) return await createAuth(app).handler(request);
    if (!match) throw new HttpError(404, "not_found", "Nothing here.");
    if (match.methodNotAllowed) throw new HttpError(405, "method_not_allowed", "That method isn't allowed here.");
    if (!match.route.opts.external) assertSameOrigin(request, config.siteUrl);
    if (!gate) return await match.route.handler(app, match.params);
    return await auditImpersonated(app, gate, match.route, () => match.route.handler(app, match.params));
  } catch (e) {
    if (!e.status) console.error("api error", path, e && e.stack ? e.stack : e);
    return errorResponse(e);
  }
}

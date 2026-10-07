// Entry point of the store API (Cloudflare Pages Functions call it for /api/*). Loads config, hands /api/auth/* to
// Better Auth, checks the origin of state-changing requests, then dispatches to the module that owns the route.
// Each module (catalog, cart, checkout, orders, payments, entitlements, downloads, account, admin, analytics, projects,
// polls, dev)
// exports its own route table; adding a feature is one import and one line below.
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
import { routes as admin } from "./admin/routes.js";
import { routes as analytics } from "./analytics/routes.js";
import { routes as dev } from "./dev/routes.js";
import { routes as projects } from "./projects/routes.js";
import { routes as polls } from "./polls/routes.js";

const router = createRouter([catalog, cart, checkout, orders, payments, library, downloads, account, admin, analytics, projects, polls, dev]);

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
    if (path.startsWith("/api/auth/")) return await createAuth(app).handler(request);
    const match = router.match(request.method, path);
    if (!match) throw new HttpError(404, "not_found", "Nothing here.");
    if (match.methodNotAllowed) throw new HttpError(405, "method_not_allowed", "That method isn't allowed here.");
    if (!match.route.opts.external) assertSameOrigin(request, config.siteUrl);
    return await match.route.handler(app, match.params);
  } catch (e) {
    if (!e.status) console.error("api error", path, e && e.stack ? e.stack : e);
    return errorResponse(e);
  }
}

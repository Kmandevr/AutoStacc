// Every address no other Function or static file claims (scripts/dist.js writes _routes.json so the static site,
// the store API and first-party pages never come through here): Studio creators' public pages, rendered by
// server/sites/public.js. Anything it doesn't know falls through to the static site and its 404 page.
import { loadConfig } from "../server/lib/config.js";
import { sitePage } from "../server/sites/public.js";

export async function onRequest(context) {
  let res = null;
  try {
    const app = { env: context.env, config: loadConfig(context.env), ctx: context, request: context.request, db: context.env.DB };
    res = await sitePage(app);
  } catch (e) {
    console.error("creator page", e && e.stack ? e.stack : e);
  }
  return res || context.next();
}

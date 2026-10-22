// Every address no other Function or static file claims (scripts/dist.js writes _routes.json so the static site,
// the store API and first-party hand-written pages never come through here): every creator's content pages
// and /sitemap-content.xml (server/content/public.js), then every product's page at /shop/<id>, the old /product?p=
// address and /sitemap-shop.xml (server/shop/public.js), then Studio creators' public pages (server/sites/public.js).
// A project's community space (/<creator>/<project>/community, server/community/core/project-routes.js) is tried first;
// anything none of them knows falls through to the static site and its 404 page.
import { loadConfig } from "../server/lib/config.js";
import { contentPage } from "../server/content/public.js";
import { shopPage } from "../server/shop/public.js";
import { sitePage } from "../server/sites/public.js";
import { projectCommunityPage } from "../server/community/core/project-routes.js";

export async function onRequest(context) {
  let res = null;
  try {
    const app = { env: context.env, config: loadConfig(context.env), ctx: context, request: context.request, db: context.env.DB };
    for (const page of [projectCommunityPage, contentPage, shopPage, sitePage]) {
      try {
        res = await page(app);
      } catch (e) {
        console.error("creator page", e && e.stack ? e.stack : e);
      }
      if (res) break;
    }
  } catch (e) {
    console.error("creator page", e && e.stack ? e.stack : e);
  }
  return res || context.next();
}

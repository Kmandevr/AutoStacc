// Product pages for every creator's products, first-party included: /shop/<product-id>, rendered from D1 by page.js
// (indexable for a trusted creator, else noindex; a 404 page for an unknown or hidden product), plus /sitemap-shop.xml
// (sitemap.js). The old Studio address /product?p=<id> answers a 301 to /shop/<id> (/product alone to /shop); mixed
// case, a trailing slash and the old generated /shop/<id>.html answer a 301 to the clean address. /shop itself stays the
// static store page. Kept in the edge cache for a minute in production.
import { getProduct, isVisible, isPurchasable, publicProduct, makerOf } from "../catalog/products.js";
import { runningSales } from "../promotions/promotions.js";
import { pageHeaders } from "../content/page.js";
import { renderProduct, renderMissing } from "./page.js";
import { shopSitemap } from "./sitemap.js";

const ID = /^[A-Za-z0-9_-]{1,80}$/;
export const SHOP_SITEMAP_PATH = "/sitemap-shop.xml";

const redirect = (siteUrl, path) => new Response(null, { status: 301, headers: { Location: siteUrl + path, "Cache-Control": "public, max-age=300" } });

async function product(app, id, head) {
  const { db, config } = app;
  const p = await getProduct(db, id);
  if (!isVisible(p)) return new Response(head ? null : renderMissing(config.siteUrl, `/shop/${id}`), { status: 404, headers: { ...pageHeaders(), "Cache-Control": "public, max-age=60" } });
  const [maker, sales] = await Promise.all([makerOf(db, p.id), runningSales(db)]);
  const s = maker && { creatorName: maker.creator_name, creatorPath: `/${maker.creator_slug}`, projectName: maker.project_name,
    projectPath: `/${maker.creator_slug}/${maker.project_slug}`, trusted: Boolean(maker.trusted) };
  const html = renderProduct(config.siteUrl, publicProduct(p, sales), s, { index: Boolean(maker && maker.indexable), forSale: isPurchasable(p) });
  return new Response(head ? null : html, { headers: pageHeaders() });
}

async function sitemap(app, head) {
  const xml = await shopSitemap(app.db, app.config.siteUrl);
  return new Response(head ? null : xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300", "X-Content-Type-Options": "nosniff" } });
}

// A Response for a product page, the old /product address or the shop sitemap, or null to let the next handler answer.
export async function shopPage(app) {
  const { request, config } = app;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const head = request.method === "HEAD";
  if (url.pathname === SHOP_SITEMAP_PATH) return sitemap(app, head);
  if (/^\/product(\.html)?\/?$/i.test(url.pathname)) {
    const p = url.searchParams.get("p") || "";
    return redirect(config.siteUrl, ID.test(p) ? `/shop/${p.toLowerCase()}` : "/shop");
  }
  const m = /^\/shop\/([^/]+?)(\.html)?(\/?)$/.exec(url.pathname);
  if (!m || !ID.test(m[1])) return null;
  const id = m[1].toLowerCase();
  if (id !== m[1] || m[2] || m[3]) return redirect(config.siteUrl, `/shop/${id}${url.search}`);
  // Edge cache in production only, so local runs and tests see a publish, a price change or a removal at once.
  const cache = config.appEnv === "production" && typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(url.origin + url.pathname, { method: "GET" });
  const hit = cache && !head ? await cache.match(key) : null;
  if (hit) return hit;
  const res = await product(app, id, head);
  if (cache && !head && res.status === 200 && app.ctx && app.ctx.waitUntil) app.ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

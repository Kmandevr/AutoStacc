// /sitemap-shop.xml (named in robots.txt): the page of every visible product of a trusted creator, first-party included,
// at /shop/<id> with its last change. Untrusted creators' product pages are noindex and stay out of it.
import { esc } from "../sites/text.js";
import { indexableProducts } from "../catalog/products.js";

const ID = /^[A-Za-z0-9_-]{1,80}$/;

export function shopSitemapXml(siteUrl, rows) {
  const urls = rows.filter((r) => r && ID.test(r.id)).map((r) => {
    const lastmod = String(r.updated_at || "").slice(0, 10);
    return `  <url><loc>${esc(`${siteUrl}/shop/${r.id}`)}</loc>${/^\d{4}-\d{2}-\d{2}$/.test(lastmod) ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

export const shopSitemap = async (db, siteUrl) => shopSitemapXml(siteUrl, await indexableProducts(db));

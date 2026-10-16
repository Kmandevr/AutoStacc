// /community/sitemap.xml: the community's own sitemap (the static sitemap.xml is built from data/ and can't list
// threads). Spaces and every visible thread; hidden and removed ones are left out (they answer 404 and are noindex).
import { listSpaces } from "./spaces.js";
import { sitemapThreads } from "./threads.js";
import { esc, spacePath, threadPath } from "./render.js";

export async function sitemap(app) {
  const base = app.config.siteUrl;
  const [spaces, threads] = await Promise.all([listSpaces(app.db), sitemapThreads(app.db)]);
  const url = (path, lastmod) => `<url><loc>${esc(base + path)}</loc>${lastmod ? `<lastmod>${esc(lastmod.slice(0, 10))}</lastmod>` : ""}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[url("/community"), ...spaces.map((s) => url(spacePath(s))), ...threads.map((t) => url(threadPath(t), t.lastPostAt))].join("\n")}
</urlset>
`;
}

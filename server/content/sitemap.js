// /sitemap-content.xml (named in robots.txt beside the static sitemap.xml, which is built from data/ and can't list
// what creators publish in the Studio): every published release and news page of a trusted creator, with its last
// change. Entries come from content.js sitemapEntries; an entry marked untrusted (its pages are noindex) is left out.
import { esc } from "../sites/text.js";

const SEGMENT = /^[a-z0-9-]{1,60}$/;
const SECTION = { release: "music", releases: "music", music: "music", news: "news" };

// An entry's address: its path, or built from { kind, creatorSlug, projectSlug, slug } (camel or snake case).
function pathOf(e) {
  if (typeof e.path === "string") return /^\/[a-z0-9-]{1,60}\/[a-z0-9-]{1,60}\/(music|news)\/[a-z0-9-]{1,60}$/.test(e.path) ? e.path : null;
  const parts = [e.creatorSlug ?? e.creator_slug ?? e.creator, e.projectSlug ?? e.project_slug ?? e.project, SECTION[e.kind], e.slug];
  return parts.every((p) => typeof p === "string" && SEGMENT.test(p)) ? "/" + parts.join("/") : null;
}

export function sitemapXml(siteUrl, entries) {
  const seen = new Set();
  const urls = [];
  for (const e of entries) {
    if (!e || e.trusted === 0 || e.trusted === false) continue;
    const path = pathOf(e);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const lastmod = String(e.lastmod ?? e.updatedAt ?? e.updated_at ?? e.date ?? "").slice(0, 10);
    urls.push(`  <url><loc>${esc(siteUrl + path)}</loc>${/^\d{4}-\d{2}-\d{2}$/.test(lastmod) ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

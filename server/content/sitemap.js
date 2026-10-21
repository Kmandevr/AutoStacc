// /sitemap-content.xml (named in robots.txt beside the static sitemap.xml, which is built from data/ and can't list
// what creators publish in the Studio): every published release and event page of a trusted creator, with its last
// change (sitemapEntries), and the public events calendar /events. News pages are off (#174) and never listed. An entry
// marked untrusted (its pages are noindex) is left out.
import { all } from "../lib/db.js";
import { esc } from "../sites/text.js";
import { KIND, select, PUBLISHED, pathOf } from "./content.js";

const SEGMENT = /^[a-z0-9-]{1,60}$/;
const SECTION = { release: "music", releases: "music", music: "music", event: "events", events: "events" };
const ITEM = /^\/[a-z0-9-]{1,60}\/[a-z0-9-]{1,60}\/(music|events)\/[a-z0-9-]{1,60}$/;
export const CALENDAR_PATH = "/events";

// Release and event pages search engines may index: published, of visible projects whose creator AutoStacc trusts
// (the others are noindex). [{ kind, path, lastmod }]
export async function sitemapEntries(db) {
  const rows = await Promise.all(Object.keys(KIND).map((kind) =>
    all(db, `${select(kind)} WHERE ${PUBLISHED} AND c.trusted = 1 ORDER BY x.${KIND[kind].date} DESC LIMIT 5000`)
      .then((list) => list.map((r) => ({ kind, path: pathOf(kind, r), lastmod: String(r.updated_at).slice(0, 10) })))));
  return rows.flat();
}

// An entry's address: its path, or built from { kind, creatorSlug, projectSlug, slug } (camel or snake case).
function pathFor(e) {
  if (typeof e.path === "string") return e.path === CALENDAR_PATH || ITEM.test(e.path) ? e.path : null;
  const parts = [e.creatorSlug ?? e.creator_slug ?? e.creator, e.projectSlug ?? e.project_slug ?? e.project, SECTION[e.kind], e.slug];
  return parts.every((p) => typeof p === "string" && SEGMENT.test(p)) ? "/" + parts.join("/") : null;
}

export function sitemapXml(siteUrl, entries) {
  const seen = new Set();
  const urls = [];
  for (const e of [{ path: CALENDAR_PATH }, ...entries]) {
    if (!e || e.trusted === 0 || e.trusted === false) continue;
    const path = pathFor(e);
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

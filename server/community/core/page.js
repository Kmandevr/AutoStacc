// Fills the /community template (built by scripts/lib/community-page.js, fetched from the static site) with a page:
// its head (title, description, canonical or noindex, Open Graph, JSON-LD) between the seo markers, and its heading
// and main areas between the community markers. The image lines of the template's own head are kept, so the site's
// share image stays defined in one place (data/site.js). Answers with the store's strict policy: this site's scripts
// only, no framing, plus the page-preloading rules (speculation-rules.json; _headers doesn't reach Functions).
// Cached for a minute at the edge and in browsers (public.js).
import { esc } from "./render.js";
import { EMBED_HOSTS } from "../../sites/embeds.js";

const SEO = /<!-- seo:start[^\n]*-->[\s\S]*?<!-- seo:end -->/;
const area = (name) => new RegExp(`(<!-- community:${name}:start -->)[\\s\\S]*?(<!-- community:${name}:end -->)`);

export const CSP = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-src ${EMBED_HOSTS.join(" ")}; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'`;

export const headers = (status = 200) => ({
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Speculation-Rules": '"/speculation-rules.json"',
  "Cache-Control": status === 200 ? "public, max-age=60, s-maxage=60" : "public, max-age=60"
});

function head(template, { siteUrl, path, title, description, index, schema }) {
  const block = (template.match(SEO) || [""])[0];
  const images = block.split("\n").filter((l) => /(og|twitter):image/.test(l)).map((l) => l.trim());
  const url = siteUrl + path;
  const meta = (attr, key, value) => `<meta ${attr}="${key}" content="${esc(value)}">`;
  const lines = [
    `<title>${esc(title)}</title>`,
    meta("name", "description", description),
    index ? `<link rel="canonical" href="${esc(url)}">` : meta("name", "robots", "noindex, follow"),
    meta("property", "og:site_name", "AutoStacc"),
    meta("property", "og:locale", "en_US"),
    meta("property", "og:type", "website"),
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    meta("property", "og:url", url),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", title),
    meta("name", "twitter:description", description),
    ...images
  ];
  if (schema && schema.length) {
    // "<" is escaped so text from a post can never close the script tag.
    lines.push(`<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": schema }).replace(/</g, "\\u003c")}</script>`);
  }
  return `<!-- seo:start · community page, server/community/page.js -->\n  ${lines.join("\n  ")}\n  <!-- seo:end -->`;
}

// page: { path, title (without the site suffix), description, index, schema, hero, main }
export function fill(template, siteUrl, page) {
  const title = `${page.title} · AutoStacc`;
  return template
    .replace(SEO, () => head(template, { siteUrl, path: page.path, title, description: page.description, index: page.index, schema: page.schema }))
    .replace(area("hero"), (m, a, b) => `${a}\n        ${page.hero}\n        ${b}`)
    .replace(area("main"), (m, a, b) => `${a}\n        ${page.main}\n        ${b}`);
}

// The <head> of every server-rendered content page (release, event, events calendar; page.js re-exports all of this):
// title, description, canonical for pages AutoStacc lets search engines index (else noindex), Open Graph and Twitter
// cards, and the JSON-LD graph, with the schema.org pieces the pages share (the AutoStacc organization, a project as
// artist or organizer, breadcrumbs, the WebPage). Every value is escaped; "<" inside the JSON-LD is too.
import { esc } from "../sites/text.js";

export const SITE_NAME = "AutoStacc";
// The share picture and logo for pages without their own artwork (data/site.js image and logo).
export const SITE_IMAGE = { src: "/img/og.png", width: 1200, height: 630, alt: "The AutoStacc logo, four stacked colour blocks, beside the AutoStacc wordmark" };
const SITE_LOGO = "/img/apple-touch-icon.png";

export const abs = (siteUrl, p) => siteUrl + p;

// ---------- schema.org ----------
export const orgRef = (siteUrl) => ({ "@type": "Organization", "@id": siteUrl + "/#organization", name: SITE_NAME, url: siteUrl + "/", logo: siteUrl + SITE_LOGO });
export const projectRef = (siteUrl, ctx, type) => ({ "@type": type, "@id": abs(siteUrl, ctx.home) + "#project", name: ctx.project.name, url: abs(siteUrl, ctx.home) });
export const breadcrumbs = (siteUrl, crumbs) => ({
  "@type": "BreadcrumbList",
  itemListElement: crumbs.map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(siteUrl, p) }))
});
export const webPage = (siteUrl, { path, title, description }, main, crumbs) => ({
  "@type": "WebPage",
  "@id": abs(siteUrl, path) + "#webpage",
  url: abs(siteUrl, path),
  name: title,
  description,
  inLanguage: "en",
  isPartOf: { "@id": siteUrl + "/#website" },
  ...(main && { mainEntity: { "@id": main } }),
  breadcrumb: breadcrumbs(siteUrl, crumbs)
});

// page: { path, title, description, index, ogType, image?, og?: { property: value }, schema: [graph nodes] }
export function head(siteUrl, page) {
  const image = page.image || SITE_IMAGE;
  const url = abs(siteUrl, page.path);
  const lines = [];
  const meta = (attr, key, value) => lines.push(`<meta ${attr}="${key}" content="${esc(value)}">`);
  lines.push(`<title>${esc(page.title)}</title>`);
  meta("name", "description", page.description);
  if (page.index) lines.push(`<link rel="canonical" href="${esc(url)}">`);
  else meta("name", "robots", "noindex, follow");
  meta("property", "og:site_name", SITE_NAME);
  meta("property", "og:locale", "en_US");
  meta("property", "og:type", page.ogType);
  meta("property", "og:title", page.title);
  meta("property", "og:description", page.description);
  meta("property", "og:url", url);
  meta("property", "og:image", abs(siteUrl, image.src));
  if (image.width) meta("property", "og:image:width", image.width);
  if (image.height) meta("property", "og:image:height", image.height);
  if (image.alt) meta("property", "og:image:alt", image.alt);
  for (const [k, v] of Object.entries(page.og || {})) meta("property", k, v);
  meta("name", "twitter:card", "summary_large_image");
  meta("name", "twitter:title", page.title);
  meta("name", "twitter:description", page.description);
  meta("name", "twitter:image", abs(siteUrl, image.src));
  if (image.alt) meta("name", "twitter:image:alt", image.alt);
  // "<" is escaped so text from the content can never close the script tag.
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": page.schema }).replace(/</g, "\\u003c");
  lines.push(`<script type="application/ld+json">${json}</script>`);
  return lines.join("\n  ");
}

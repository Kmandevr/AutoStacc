// Whole HTML documents for creator sites: a project's or profile's pages (the shared renderer js/site-render.js) and,
// for a creator who hasn't published a profile, the generated list of their projects. No creator scripts, forms or
// logins can appear on them: the markup comes only from the shared renderer, and the CSP below allows no script but
// AutoStacc's own runtime, no forms and no frame outside the embed providers. Every page carries a thin AutoStacc strip
// so a visitor always knows where they are and that accounts, carts and payments live on AutoStacc itself.
import siteRender from "../../js/site-render.js";
import { esc } from "./text.js";
import { EMBED_HOSTS } from "./embeds.js";
import { DEFAULT_THEME } from "./theme.js";
import { pageMeta } from "./targets.js";

// The one script a creator page may load (docs/builder.md): AutoStacc's runtime for its interactive pieces.
export const RUNTIME_PATH = "/js/site-runtime.js";

export const cspFor = (siteUrl) => [
  "default-src 'none'",
  "img-src 'self' data:",
  "media-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `frame-src ${EMBED_HOSTS.join(" ")}`,
  `script-src ${siteUrl}${RUNTIME_PATH}`,
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join("; ");

// Headers for every creator page; cacheable for a minute (sites/public.js also keeps it in the edge cache).
export const pageHeaders = (siteUrl) => ({
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": cspFor(siteUrl),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cache-Control": "public, max-age=60, s-maxage=60"
});

// One page of a site. target: sites/targets.js; ctx: sites/context.js.
export function renderPage({ siteUrl, target, doc, page, ctx, indexable }) {
  const meta = pageMeta(target, page);
  return siteRender.pageHtml({ siteUrl, path: page.slug ? `${target.base}/${page.slug}` : target.base, title: meta.title, description: meta.description,
    indexable, doc, page, ctx, header: meta.header, runtime: siteUrl + RUNTIME_PATH });
}

// A creator without a published profile: its name and its published projects, as before the builder.
export function renderProfileList({ siteUrl, creator, projects, indexable }) {
  const doc = { version: 2, theme: { ...DEFAULT_THEME }, nav: { items: [] }, pages: [] };
  const page = { slug: "", title: "Home", sections: [] };
  const html = siteRender.pageHtml({ siteUrl, path: `/${creator.slug}`, title: `${creator.name} · AutoStacc`, description: `${creator.name} on AutoStacc.`, indexable,
    doc, page, ctx: { images: new Map(), products: new Map(), projects: new Map() }, header: { base: `/${creator.slug}`, name: creator.name, by: null }, runtime: null });
  const list = projects.length ? `<ul class="cs-projects-list">${projects.map((p) => `<li><a href="/${esc(creator.slug)}/${esc(p.slug)}">${esc(p.name)}</a></li>`).join("")}</ul>`
    : '<p class="cs-muted">Nothing published yet.</p>';
  return html.replace('<main class="cs-main"></main>', `<main class="cs-main cs-main-list"><p class="cs-by">Creator</p>${list}</main>`);
}

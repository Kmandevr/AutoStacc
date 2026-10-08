// Whole HTML documents for creator sites: a project's pages and a Studio creator's profile. No scripts, forms or
// logins can appear on them: the markup comes only from sites/blocks.js and the CSP below forbids scripts, forms and
// any frame outside the embed providers. Pages carry a thin AutoStacc strip so a visitor always knows where they are
// and that the account, cart and payments live on AutoStacc itself, not on the creator's page.
import { esc } from "./text.js";
import { EMBED_HOSTS } from "./embeds.js";
import { themeCss, fontHref, DEFAULT_THEME } from "./theme.js";
import { renderBlocks } from "./blocks.js";

export const CSP = [
  "default-src 'none'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  `frame-src ${EMBED_HOSTS.join(" ")}`,
  "script-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join("; ");

// Headers for every creator page; cacheable for a minute (sites/public.js also keeps it in the edge cache).
export const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cache-Control": "public, max-age=60, s-maxage=60"
};

function documentHtml({ siteUrl, path, title, description, indexable, theme, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  ${description ? `<meta name="description" content="${esc(description)}">` : ""}
  <link rel="canonical" href="${esc(siteUrl + path)}">
  ${indexable ? "" : '<meta name="robots" content="noindex">'}
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:url" content="${esc(siteUrl + path)}">
  <meta property="og:site_name" content="AutoStacc">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <link rel="icon" href="/img/favicon.png" type="image/png">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${esc(fontHref(theme))}">
  <link rel="stylesheet" href="/css/creator-site.css">
  <style>${themeCss(theme)}</style>
</head>
<body>
  <div class="cs-strip"><a href="/">AutoStacc</a><span>Creator page · accounts, cart and payments only ever happen on AutoStacc itself</span></div>
${body}
  <footer class="cs-footer"><a href="/">Made on AutoStacc</a> · <a href="/about">About AutoStacc</a></footer>
</body>
</html>
`;
}

// One published page of a project's site. site: { creator, project, doc, page, indexable, siteUrl }.
export function renderPage({ siteUrl, creator, project, doc, page, ctx, indexable }) {
  const base = `/${creator.slug}/${project.slug}`;
  const path = page.slug ? `${base}/${page.slug}` : base;
  const nav = doc.pages.length > 1 ? `<nav class="cs-nav" aria-label="${esc(project.name)}">${doc.pages.map((p) => {
    const href = p.slug ? `${base}/${p.slug}` : base;
    return `<a href="${esc(href)}"${p.slug === page.slug ? ' aria-current="page"' : ""}>${esc(p.title)}</a>`;
  }).join("")}</nav>` : "";
  const body = `  <header class="cs-header">
    <p class="cs-by"><a href="/${esc(creator.slug)}">${esc(creator.name)}</a></p>
    <p class="cs-title"><a href="${esc(base)}">${esc(project.name)}</a></p>
    ${nav}
  </header>
  <main class="cs-main">
${renderBlocks(page.blocks, ctx)}
  </main>`;
  const title = page.slug ? `${page.title} · ${project.name} · AutoStacc` : `${project.name} by ${creator.name} · AutoStacc`;
  return documentHtml({ siteUrl, path, title, description: `${project.name} by ${creator.name} on AutoStacc.`, indexable, theme: doc.theme, body });
}

// A Studio creator's profile: its name and its published projects.
export function renderProfile({ siteUrl, creator, projects, indexable }) {
  const body = `  <header class="cs-header"><p class="cs-by">Creator</p><h1 class="cs-title">${esc(creator.name)}</h1></header>
  <main class="cs-main">
    ${projects.length ? `<ul class="cs-projects">${projects.map((p) => `<li><a href="/${esc(creator.slug)}/${esc(p.slug)}">${esc(p.name)}</a></li>`).join("")}</ul>`
    : '<p class="cs-muted">Nothing published yet.</p>'}
  </main>`;
  return documentHtml({ siteUrl, path: `/${creator.slug}`, title: `${creator.name} · AutoStacc`, description: `${creator.name} on AutoStacc.`, indexable,
    theme: DEFAULT_THEME, body });
}

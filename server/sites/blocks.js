// One HTML fragment per block of a cleaned site document (sites/document.js). Every value is escaped; links go
// through safeUrl, embeds through embedFor, images and products only when ctx says they are the creator's own.
// ctx: { images: Map(assetId → src), products: Map(productId → { title, path, artwork }) }.
import { esc, markup, safeUrl, linkAttrs } from "./text.js";
import { embedFor } from "./embeds.js";

const fmtDate = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const img = (ctx, asset, alt) => (ctx.images.has(asset)
  ? `<img src="${esc(ctx.images.get(asset))}" alt="${esc(alt)}" loading="lazy" decoding="async">` : "");

const link = (url, label, cls = "") => {
  const href = safeUrl(url);
  return href ? `<a${cls ? ` class="${cls}"` : ""} href="${esc(href)}"${linkAttrs(href)}>${esc(label)}</a>` : "";
};

const RENDER = {
  heading: (b) => `<h${b.level}>${esc(b.text)}</h${b.level}>`,
  text: (b) => `<div class="cs-text">${markup(b.text)}</div>`,
  image: (b, ctx) => {
    const tag = img(ctx, b.asset, b.alt);
    return tag ? `<figure class="cs-image">${tag}${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>` : "";
  },
  gallery: (b, ctx) => {
    const items = b.images.map((x) => img(ctx, x.asset, x.alt)).filter(Boolean);
    return items.length ? `<div class="cs-gallery">${items.map((t) => `<figure>${t}</figure>`).join("")}</div>` : "";
  },
  button: (b) => `<p class="cs-button">${link(b.url, b.label, "cs-btn")}</p>`,
  embed: (b) => {
    const e = embedFor(b.url);
    return e ? `<div class="cs-embed cs-embed-${e.provider}"><iframe src="${esc(e.src)}" title="${esc(e.title)} player" height="${e.height}"${e.ratio ? ` style="aspect-ratio:${e.ratio};height:auto"` : ""} loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"></iframe></div>` : "";
  },
  events: (b) => `<section class="cs-events">${b.title ? `<h2>${esc(b.title)}</h2>` : ""}${b.items.length
    ? `<ul>${[...b.items].sort((x, y) => x.date.localeCompare(y.date)).map((x) => `<li><time datetime="${esc(x.date)}">${esc(fmtDate(x.date))}</time>
      <span class="cs-event-what"><strong>${esc(x.title)}</strong>${[x.venue, x.city].filter(Boolean).length ? ` <span>${esc([x.venue, x.city].filter(Boolean).join(", "))}</span>` : ""}</span>
      ${x.url ? link(x.url, "Details", "cs-btn small") : ""}</li>`).join("")}</ul>`
    : "<p class=\"cs-muted\">No dates yet.</p>"}</section>`,
  socials: (b) => (b.links.length ? `<ul class="cs-socials">${b.links.map((x) => `<li>${link(x.url, x.network)}</li>`).join("")}</ul>` : ""),
  products: (b, ctx) => {
    const items = b.ids.filter((id) => ctx.products.has(id)).map((id) => ctx.products.get(id));
    return items.length ? `<section class="cs-products">${b.title ? `<h2>${esc(b.title)}</h2>` : ""}<ul>${items.map((p) => `<li><a href="${esc(p.path)}">${p.artwork
      ? `<img src="${esc(p.artwork)}" alt="" loading="lazy">` : ""}<strong>${esc(p.title)}</strong><span>See it in the AutoStacc store &rarr;</span></a></li>`).join("")}</ul></section>` : "";
  },
  divider: () => "<hr>"
};

export const renderBlocks = (blocks, ctx) => blocks.map((b) => (RENDER[b.type] ? RENDER[b.type](b, ctx) : "")).filter(Boolean).join("\n");

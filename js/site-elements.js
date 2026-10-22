// What each element of a creator site looks like in HTML (docs/builder.md). Every value is escaped; links go through
// safeUrl, embeds through embedFor, images, products and projects only when ctx says they are the creator's own (or
// came with a piece they installed). Each interactive element works without a script: slides scroll, every tab shows,
// accordions are <details>, audio has the browser's controls, a countdown shows its date; AutoStacc's runtime
// (js/site-runtime.js) only improves them. Store pieces are links to AutoStacc's own pages, never carts or forms.
// Releases and a project's events come from the Studio (server/sites/content-refs.js), drawn as cards linking to their
// own pages, and only for a project in ctx.projects; the editor, which has no such lists, shows where they go.
// ctx: { images: Map(id → src), products: Map(id → { title, path, artwork, preview }), projects: Map(id → { name, path }),
//   releases?: Map(projectId → [{ title, type, date, path, artwork }]), events?: Map(projectId → [{ title, date, time, venue, city, country, path }]) }.
// Shared by the server and the Studio's editor; pure. Sets GS.siteElements in browsers.
(function (root) {
  "use strict";

  const T = typeof module === "object" && module.exports ? require("./site-text.js") : root.GS.siteText;
  const E = typeof module === "object" && module.exports ? require("./site-embeds.js") : root.GS.siteEmbeds;
  const { esc, markup, safeUrl, linkAttrs } = T;

  const fmtDate = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const fmtWhen = (at) => new Date(at + ":00Z").toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

  const img = (ctx, asset, alt, extra = "") => (ctx.images.has(asset)
    ? `<img src="${esc(ctx.images.get(asset))}" alt="${esc(alt)}" loading="lazy" decoding="async"${extra}>` : "");
  const link = (url, label, cls = "") => {
    const href = safeUrl(url);
    return href ? `<a${cls ? ` class="${cls}"` : ""} href="${esc(href)}"${linkAttrs(href)}>${esc(label)}</a>` : "";
  };
  const items = (list, fn) => list.map(fn).filter(Boolean).join("");
  const h2 = (title) => (title ? `<h2>${esc(title)}</h2>` : "");
  // A project's Studio list: null when it can't show (not the creator's, not live), the editor's placeholder, or the cards.
  const fromProject = (ctx, kind, project, what) => {
    const p = ctx.projects.get(project);
    if (ctx.editor && (!p || !ctx[kind])) return { hint: `<p class="cs-empty">${p ? `${what} from ${esc(p.name)} appear here` : "Pick one of your published projects"}</p>` };
    return p && ctx[kind] ? { list: ctx[kind].get(project) || [] } : null;
  };
  const releaseCard = (r) => `<li><a href="${esc(r.path)}">${r.artwork ? `<img src="${esc(r.artwork.src)}" alt="" loading="lazy" decoding="async">` : ""}
    <strong>${esc(r.title)}</strong><span>${esc([r.type, r.date && fmtDate(r.date)].filter(Boolean).join(" · "))}</span></a></li>`;
  const eventCard = (x) => `<li><a href="${esc(x.path)}"><time datetime="${esc(x.date)}">${esc(fmtDate(x.date))}${x.time ? ` · ${esc(x.time)}` : ""}</time>
    <strong>${esc(x.title)}</strong>${[x.venue, x.city, x.country].filter(Boolean).length ? `<span>${esc([x.venue, x.city, x.country].filter(Boolean).join(", "))}</span>` : ""}</a></li>`;

  const RENDER = {
    heading: (b) => `<h${b.level} class="cs-h">${esc(b.text)}</h${b.level}>`,
    text: (b) => `<div class="cs-text">${markup(b.text)}</div>`,
    image: (b, ctx) => {
      const tag = img(ctx, b.asset, b.alt, b.fit === "contain" ? ' class="cs-contain"' : "");
      if (!tag) return "";
      const href = b.url && safeUrl(b.url);
      const pic = href ? `<a href="${esc(href)}"${linkAttrs(href)}>${tag}</a>` : tag;
      return `<figure class="cs-image">${pic}${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`;
    },
    gallery: (b, ctx) => {
      const list = items(b.images, (x) => {
        const tag = img(ctx, x.asset, x.alt);
        return tag ? `<figure>${b.lightbox ? `<a href="${esc(ctx.images.get(x.asset))}" data-lightbox>${tag}</a>` : tag}</figure>` : "";
      });
      return list ? `<div class="cs-gallery"${b.lightbox ? " data-fx-lightbox" : ""}>${list}</div>` : "";
    },
    slideshow: (b, ctx) => {
      const list = items(b.images, (x) => {
        const tag = img(ctx, x.asset, x.alt);
        return tag ? `<figure class="cs-slide">${tag}${x.caption ? `<figcaption>${esc(x.caption)}</figcaption>` : ""}</figure>` : "";
      });
      return list ? `<div class="cs-slides" data-slides${b.auto ? ` data-auto="${b.auto}"` : ""} tabindex="0" aria-label="Slideshow">${list}</div>` : "";
    },
    button: (b) => `<p class="cs-button">${link(b.url, b.label, b.variant === "outline" ? "cs-btn outline" : "cs-btn")}</p>`,
    embed: (b, ctx) => {
      const e = E.embedFor(b.url);
      // The editor can't frame other sites (the Studio's own CSP); it shows where the player goes.
      if (e && ctx.editor) return `<div class="cs-embed cs-empty" style="min-height:${Math.min(e.height, 200)}px">${esc(e.title)} player</div>`;
      return e ? `<div class="cs-embed cs-embed-${e.provider}"><iframe src="${esc(e.src)}" title="${esc(e.title)} player" height="${e.height}"${e.ratio ? ` style="aspect-ratio:${e.ratio};height:auto"` : ""} loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"></iframe></div>` : "";
    },
    events: (b, ctx) => {
      if (b.project) {
        const got = fromProject(ctx, "events", b.project, "Upcoming events");
        if (!got) return "";
        return `<section class="cs-events">${h2(b.title)}${got.hint || (got.list.length ? `<ul class="cs-cards">${got.list.map(eventCard).join("")}</ul>` : '<p class="cs-muted">No dates yet.</p>')}</section>`;
      }
      return `<section class="cs-events">${h2(b.title)}${b.items.length
        ? `<ul>${[...b.items].sort((x, y) => x.date.localeCompare(y.date)).map((x) => `<li><time datetime="${esc(x.date)}">${esc(fmtDate(x.date))}</time>
        <span class="cs-event-what"><strong>${esc(x.title)}</strong>${[x.venue, x.city].filter(Boolean).length ? ` <span>${esc([x.venue, x.city].filter(Boolean).join(", "))}</span>` : ""}</span>
        ${x.url ? link(x.url, "Details", "cs-btn small") : ""}</li>`).join("")}</ul>`
        : '<p class="cs-muted">No dates yet.</p>'}</section>`;
    },
    releases: (b, ctx) => {
      const got = fromProject(ctx, "releases", b.project, "Newest releases");
      if (!got) return "";
      const list = got.list ? got.list.slice(0, b.count) : [];
      return `<section class="cs-releases">${h2(b.title)}${got.hint || (list.length ? `<ul class="cs-cards">${list.map(releaseCard).join("")}</ul>` : '<p class="cs-muted">No releases yet.</p>')}</section>`;
    },
    socials: (b) => (b.links.length ? `<ul class="cs-socials">${b.links.map((x) => `<li>${link(x.url, x.network)}</li>`).join("")}</ul>` : ""),
    products: (b, ctx) => {
      const list = b.ids.filter((id) => ctx.products.has(id)).map((id) => ctx.products.get(id));
      return list.length ? `<section class="cs-products">${b.title ? `<h2>${esc(b.title)}</h2>` : ""}<ul>${list.map((p) => `<li><a href="${esc(p.path)}">${p.artwork
        ? `<img src="${esc(p.artwork)}" alt="" loading="lazy">` : ""}<strong>${esc(p.title)}</strong><span>See it in the AutoStacc store &rarr;</span></a></li>`).join("")}</ul></section>` : "";
    },
    audio: (b, ctx) => {
      const p = ctx.products.get(b.product);
      if (!p || !p.preview) return "";
      return `<figure class="cs-audio" data-audio><figcaption><strong>${esc(b.title || p.title)}</strong> <a href="${esc(p.path)}">In the AutoStacc store &rarr;</a></figcaption>
        <audio controls preload="none" src="${esc(p.preview)}"></audio></figure>`;
    },
    countdown: (b) => `<div class="cs-countdown" data-countdown="${esc(b.at)}:00Z"${b.done ? ` data-done="${esc(b.done)}"` : ""}>${b.label ? `<p class="cs-countdown-label">${esc(b.label)}</p>` : ""}<p class="cs-countdown-when"><time datetime="${esc(b.at)}:00Z">${esc(fmtWhen(b.at))}</time></p></div>`,
    tabs: (b) => (b.items.length ? `<div class="cs-tabs" data-tabs>${b.items.map((x) => `<section class="cs-tab"><h3>${esc(x.title)}</h3><div class="cs-text">${markup(x.text)}</div></section>`).join("")}</div>` : ""),
    accordion: (b) => (b.items.length ? `<div class="cs-accordion">${b.items.map((x) => `<details><summary>${esc(x.title)}</summary><div class="cs-text">${markup(x.text)}</div></details>`).join("")}</div>` : ""),
    projects: (b, ctx) => {
      const list = [...ctx.projects.values()];
      return `<section class="cs-projects">${b.title ? `<h2>${esc(b.title)}</h2>` : ""}${list.length
        ? `<ul>${list.map((p) => `<li><a href="${esc(p.path)}">${esc(p.name)}</a></li>`).join("")}</ul>` : '<p class="cs-muted">Nothing published yet.</p>'}</section>`;
    },
    follow: (b, ctx) => {
      const p = ctx.projects.get(b.project);
      return p ? `<p class="cs-button"><a class="cs-btn" href="/discover?tab=projects&amp;q=${esc(encodeURIComponent(p.name))}">${esc(b.label || `Follow ${p.name} on AutoStacc`)}</a></p>` : "";
    },
    cart: (b) => `<p class="cs-button"><a class="cs-btn outline" href="/cart">${esc(b.label || "Your AutoStacc cart")}</a></p>`,
    divider: () => "<hr>",
    spacer: () => ""
  };

  const TYPES = Object.keys(RENDER);
  const render = (el, ctx) => (RENDER[el.type] ? RENDER[el.type](el, ctx) : "");

  const api = { TYPES, render };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.GS = root.GS || {}).siteElements = api;
})(typeof self !== "undefined" ? self : globalThis);

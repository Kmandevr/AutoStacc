// The frame on a project's pages: a thin AutoStacc strip (its logo to the home page, Store, Projects, and for a
// signed-in visitor Dashboard, Your Stacc and Log out; Log in and Create account or Dashboard, cart and the slot
// js/theme.js fills; js/account-nav.js shows the data-auth set that matches the visitor), then the project's own header in its theme (its logo and wordmark to its home, its pages as nav, a menu button on phones and the
// slot js/sound.js fills) and its own footer with an AutoStacc line. The header and footer carry the project's skin
// class, so each project styles them in its own look (css/projects/<id>/skin.css); without a skin they use
// css/project-frame.css. <body data-project="<id>" data-project-page="music"> marks the project and page.
// Needs data/site.js, data/projects.js and js/util.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { $, escapeHTML: e, isSet } = GS;
  const SITE = window.SITE || {};
  const body = document.body.dataset;
  const P = GS.currentProject();
  const header = $("#site-header");
  const footer = $("#site-footer");
  if (!P.id || !header) return;

  const skin = P.skin ? ` skin-${e(P.id)}` : "";
  const href = (path = "") => (path.startsWith("#") ? GS.projectPath(P.id) + path : GS.projectPath(P.id, path));
  const here = (path) => !path.startsWith("#") && (body.projectPage || "") === path;
  // The wordmark is the project's own lettering (data/projects.js `wordmark`, else its name); an "&" can be styled.
  const wordmark = e(P.wordmark || P.name).replace(/&amp;/g, '<span class="ph-amp">&amp;</span>');
  const MARK = `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="10" y="12" width="36" height="10" rx="3"/><rect x="16" y="27" width="38" height="10" rx="3"/><rect x="10" y="42" width="30" height="10" rx="3"/><rect x="44" y="42" width="10" height="10" rx="3"/></svg>`;

  const main = GS.skipLink();
  header.className = "project-frame";
  header.innerHTML = `
    <div class="as-strip">
      <a class="as-home" href="/">${MARK}<span>${e(SITE.name || "Home")}</span></a>
      <nav class="as-links" aria-label="${e(SITE.name || "Site")}">
        <a href="/shop">Store</a><a href="/projects">Projects</a>
        <a href="/library" data-auth="in" hidden>Your Stacc</a>
        <button class="as-signout" type="button" data-auth="in" data-signout hidden>Log out</button>
      </nav>
      <div class="topbar-tools">
        <a class="tool-link" href="/login" data-auth="out">Log in</a>
        <a class="tool-link tool-cta" href="/login#signup" data-auth="out">Create account</a>
        <a class="tool-link" href="/dashboard" data-auth="in" hidden>Dashboard</a>
        <a class="tool-link cart-link" href="/cart">Cart<span class="cart-count" aria-hidden="true"></span><span class="sr-only cart-count-sr"></span></a>
      </div>
    </div>
    <div class="project-header${skin}">
      <div class="ph-wrap">
        <a class="ph-logo" href="${e(href())}" aria-label="${e(P.name)}, home">${P.logo ? `<img class="ph-mark" src="/${e(P.logo)}" width="40" height="40" alt="">` : ""}<span class="ph-word">${wordmark}</span></a>
        <button class="ph-toggle" type="button" aria-expanded="false" aria-controls="ph-nav"><span class="ph-toggle-icon" aria-hidden="true"></span><span class="sr-only">${e(P.name)} menu</span></button>
        <nav class="ph-nav" id="ph-nav" aria-label="${e(P.name)}">
          ${(P.pages || [{ label: "Home", path: "" }]).map((pg) =>
            `<a href="${e(href(pg.path))}"${here(pg.path) ? ' aria-current="page"' : ""}>${e(pg.label)}</a>`).join("")}
          <div class="project-tools"></div>
        </nav>
      </div>
    </div>`;

  // Phones: the project's nav opens below its header; the page behind doesn't scroll. Escape or a link closes it.
  const toggle = $(".ph-toggle", header);
  const nav = $(".ph-nav", header);
  const setOpen = (open, refocus = false) => {
    nav.classList.toggle("open", open);
    document.documentElement.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (main) main.inert = open;
    if (!open && refocus) toggle.focus();
  };
  toggle.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
  nav.addEventListener("click", (ev) => { if (ev.target.closest("a")) setOpen(false); });
  addEventListener("keydown", (ev) => { if (ev.key === "Escape" && nav.classList.contains("open")) setOpen(false, true); });
  matchMedia("(max-width: 900px)").addEventListener("change", () => setOpen(false));

  GS.showCartCount(header);

  // Footer: the project's own (name, official profiles), then who sells and delivers it.
  if (footer) {
    const socials = (P.socials || []).filter((s) => isSet(s.url));
    footer.className = `site-footer project-footer${skin}`;
    footer.innerHTML = `
      <div class="wrap">
        <div class="footer-project"><span>${e(P.name)}</span>${socials.length ? `<div class="socials" role="group" aria-label="${e(P.name)} profiles">
          ${socials.map((s) => `<a href="${e(s.url)}" target="_blank" rel="me noopener">${e(s.name)}</a>`).join("")}</div>` : ""}</div>
        <div class="footer-platform">
          <span>Sold and delivered by <a href="/">${e(SITE.name || "")}</a></span>
          <a href="/shop">Store</a><a href="/library">Your Stacc</a><a href="/about">About</a>
        </div>
      </div>`;
  }
})();

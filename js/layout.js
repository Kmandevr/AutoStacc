// AutoStacc's frame on platform pages: the sidebar (AutoStacc: Store, Your Stacc, About; Projects: one link per
// project in data/projects.js), the top bar (menu button on phones, account, cart count, and the slot js/theme.js
// fills), the footer and the skip link. On a computer the sidebar is an icon rail that expands (remembered); on phones
// it is a drawer. <body data-page> marks the current page. A project's pages use js/project-frame.js instead.
// Needs data/site.js, data/projects.js and js/util.js. Structured data is static, from scripts/build.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { $, escapeHTML: e } = GS;
  const SITE = window.SITE || {};
  const PROJECTS = (window.PROJECTS || []).filter((p) => !p.draft);
  const body = document.body.dataset;
  const KEY = "gs:side";
  const svg = (key, paths) => `<svg class="side-icon side-icon-${key}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
  const ICONS = {
    store: svg("store", '<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
    stacc: svg("stacc", '<rect x="4" y="4" width="16" height="4.5" rx="1.5"/><rect x="4" y="10" width="16" height="4.5" rx="1.5"/><rect x="4" y="16" width="16" height="4" rx="1.5"/>'),
    about: svg("about", '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.4"/>'),
    all: svg("all", '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>')
  };
  const PLATFORM = [["/shop", "Store", "shop", "store"], ["/library", "Your Stacc", "library", "stacc"], ["/about", "About", "about", "about"]];
  // Pages inside a section (a product) light up their section's link without claiming to be it.
  const current = (key) => (key === body.page ? ' aria-current="page"' : key === body.section ? ' aria-current="true"' : "");
  const MARK = `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="10" y="12" width="36" height="10" rx="3"/><rect x="16" y="27" width="38" height="10" rx="3"/><rect x="10" y="42" width="30" height="10" rx="3"/><rect x="44" y="42" width="10" height="10" rx="3"/></svg>`;
  const item = (href, label, icon, attrs = "") =>
    `<li><a href="${e(href)}" title="${e(label)}"${attrs}>${icon}<span class="side-text">${e(label)}</span></a></li>`;
  const projectChip = (p) => `<span class="side-chip" aria-hidden="true">${e((p.name || "?").charAt(0))}</span>`;

  const main = GS.skipLink();
  const header = $("#site-header");
  const footer = $("#site-footer");
  if (header) {
    header.className = "site-frame";
    header.innerHTML = `
      <div class="side" id="side" aria-label="Menu">
        <button class="side-close" type="button"><span aria-hidden="true">&times;</span><span class="sr-only">Close menu</span></button>
        <a class="brand" href="/" title="${e(SITE.name || "Home")}"${body.page === "home" ? ' aria-current="page"' : ""}>${MARK}<span class="brand-name side-text">Auto<b>Stacc</b></span></a>
        <nav class="side-nav" aria-label="Main">
          <p class="side-label" id="side-platform">AutoStacc</p>
          <ul aria-labelledby="side-platform">
            ${PLATFORM.map(([href, label, key, icon]) => item(href, label, ICONS[icon], current(key))).join("")}
          </ul>
          <p class="side-label" id="side-projects">Projects</p>
          <ul aria-labelledby="side-projects">
            ${PROJECTS.map((p) => item(GS.projectPath(p.id), p.name, projectChip(p))).join("")}
            ${item("/projects", "All projects", ICONS.all, current("projects"))}
          </ul>
        </nav>
        <button class="side-collapse" type="button" aria-controls="side"><span class="side-collapse-icon" aria-hidden="true"></span><span class="side-text">Collapse</span></button>
      </div>
      <div class="side-scrim" hidden></div>
      <div class="topbar">
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="side"><span class="menu-bars" aria-hidden="true"></span><span class="sr-only">Menu</span></button>
        <a class="topbar-brand" href="/" aria-label="${e(SITE.name || "Home")}, home">${MARK}</a>
        <div class="topbar-tools">
          <a class="tool-link" href="/account"${current("account")}>Account</a>
          <a class="tool-link cart-link" href="/cart"${current("cart")}>Cart<span class="cart-count" aria-hidden="true"></span><span class="sr-only cart-count-sr"></span></a>
        </div>
      </div>`;

    const root = document.documentElement;
    const side = $(".side", header);
    const narrow = matchMedia("(max-width: 900px)");

    // Computer: an icon rail by default; the button at its foot expands it and the choice is remembered.
    const collapse = $(".side-collapse", side);
    let wide = false;
    try { wide = localStorage.getItem(KEY) === "open"; } catch { /* storage blocked: rail */ }
    const setWide = (on) => {
      wide = on;
      root.classList.toggle("side-open", on);
      collapse.setAttribute("aria-expanded", String(on));
      collapse.title = on ? "Collapse the menu" : "Expand the menu";
      $(".side-text", collapse).textContent = on ? "Collapse" : "Expand";
    };
    setWide(wide);
    collapse.addEventListener("click", () => {
      setWide(!wide);
      try { localStorage.setItem(KEY, wide ? "open" : "rail"); } catch { /* not remembered */ }
    });

    // Phones: a drawer over the page. Closed, it is inert (no hidden links to Tab into); open, the rest of the page is
    // inert, focus moves into it, and the close button, Escape or the scrim close it.
    const toggle = $(".menu-toggle", header);
    const scrim = $(".side-scrim", header);
    const behind = () => [$(".topbar", header), main, footer].filter(Boolean);
    const setOpen = (open, refocus = true) => {
      side.classList.toggle("open", open);
      scrim.hidden = !open;
      root.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      side.inert = narrow.matches && !open;
      behind().forEach((el) => (el.inert = open));
      if (open) $(".side-close", side).focus();
      else if (refocus && narrow.matches) toggle.focus();
    };
    setOpen(false, false);
    // Crossing the drawer breakpoint closes it, so it doesn't reappear open when narrowed again.
    narrow.addEventListener("change", () => setOpen(false, false));
    toggle.addEventListener("click", () => setOpen(true));
    $(".side-close", side).addEventListener("click", () => setOpen(false));
    scrim.addEventListener("click", () => setOpen(false));
    side.addEventListener("click", (ev) => { if (ev.target.closest("a")) setOpen(false, false); });
    addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && side.classList.contains("open")) setOpen(false);
    });

    GS.showCartCount(header);
  }

  if (footer) {
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="wrap">
        <div class="footer-platform">
          <span>&copy; ${new Date().getFullYear()} ${e(SITE.name || "")}</span>
          <a href="/about">About</a><a href="/projects">Projects</a><a href="/shop">Store</a>
          ${SITE.email ? `<a href="mailto:${e(SITE.email)}">${e(SITE.email)}</a>` : ""}
        </div>
      </div>`;
  }
})();

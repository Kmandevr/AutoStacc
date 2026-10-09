// AutoStacc's frame on platform pages (the footer: Explore, Help and Legal links, docs/production.md): the sidebar (AutoStacc: Home, Store, About; Projects: one link per project in
// data/projects.js; You, once signed in: Dashboard and Your Stacc), the top bar (menu button on phones, Log in and
// Create account, cart count, the slot js/theme.js fills, and the account menu's slot, [data-account-menu], which
// js/account-nav.js fills with Studio, Settings, Log out and the rest), the footer and the skip link. Signed-in parts
// carry data-auth="in" and start hidden; js/account-nav.js shows the set that matches the visitor. On a computer the
// sidebar is an icon rail that expands (remembered); on phones it is a drawer. <body data-page> marks the current page
// (and data-section the section it sits in). A project's pages use js/project-frame.js instead.
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
    dashboard: svg("dashboard", '<rect x="4" y="4" width="7" height="9" rx="1.5"/><rect x="13" y="4" width="7" height="5" rx="1.5"/><rect x="13" y="11" width="7" height="9" rx="1.5"/><rect x="4" y="15" width="7" height="5" rx="1.5"/>'),
    account: svg("account", '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>'),
    settings: svg("settings", '<path d="M5 7h14M5 12h14M5 17h14"/><circle cx="9" cy="7" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="8" cy="17" r="1.8"/>'),
    stacc: svg("stacc", '<rect x="4" y="4" width="16" height="4.5" rx="1.5"/><rect x="4" y="10" width="16" height="4.5" rx="1.5"/><rect x="4" y="16" width="16" height="4" rx="1.5"/>'),
    studio: svg("studio", '<path d="M5 19l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L9 18z"/><path d="M13.5 7.5l3 3"/>'),
    home: svg("home", '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9.5h11V10"/>'),
    about: svg("about", '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.4"/>'),
    all: svg("all", '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>')
  };
  // Public pages for everyone; the signed-in group only once js/account-nav.js knows the visitor is signed in.
  // Studio, Settings and the rest of the account live in the top bar's account menu (js/account-nav.js).
  const YOU = [["/dashboard", "Dashboard", "dashboard", "dashboard"], ["/library", "Your Stacc", "library", "stacc"]];
  const PLATFORM = [["/", "Home", "home", "home"], ["/shop", "Store", "shop", "store"], ["/about", "About", "about", "about"]];
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
        <a class="brand" href="/" title="${e(SITE.name || "Home")}">${MARK}<span class="brand-name side-text">Auto<b>Stacc</b></span></a>
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
          <div data-auth="in" hidden>
            <p class="side-label" id="side-you">You</p>
            <ul aria-labelledby="side-you">
              ${YOU.map(([href, label, key, icon]) => item(href, label, ICONS[icon], current(key))).join("")}
            </ul>
          </div>
        </nav>
        <button class="side-collapse" type="button" aria-controls="side"><span class="side-collapse-icon" aria-hidden="true"></span><span class="side-text">Collapse</span></button>
      </div>
      <div class="side-scrim" hidden></div>
      <nav class="tabbar" aria-label="Quick links">
        <a href="/shop"${current("shop")}>${ICONS.store}<span>Store</span></a>
        <a href="/projects"${current("projects")}>${ICONS.all}<span>Projects</span></a>
        <a href="/library" data-auth="in" hidden${current("library")}>${ICONS.stacc}<span>Your Stacc</span></a>
        <a href="/login" data-auth="out"${current("login")}>${ICONS.account}<span>Log in</span></a>
        <button type="button" data-tab-menu aria-controls="side" aria-expanded="false">${ICONS.settings}<span>Menu</span></button>
      </nav>
      <div class="topbar">
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="side"><span class="menu-bars" aria-hidden="true"></span><span class="sr-only">Menu</span></button>
        <a class="topbar-brand" href="/" aria-label="${e(SITE.name || "Home")}, home">${MARK}</a>
        <div class="topbar-tools">
          <a class="tool-link" href="/login" data-auth="out"${current("login")}>Log in</a>
          <a class="tool-link tool-cta" href="/login#signup" data-auth="out">Create account</a>
          <a class="tool-link cart-link" href="/cart"${current("cart")}>Cart<span class="cart-count" aria-hidden="true"></span><span class="sr-only cart-count-sr"></span></a>
          <div class="account-menu" data-account-menu data-auth="in" hidden></div>
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
    const behind = () => [$(".topbar", header), $(".tabbar", header), main, footer].filter(Boolean);
    const setOpen = (open, refocus = true) => {
      side.classList.toggle("open", open);
      scrim.hidden = !open;
      root.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      $("[data-tab-menu]", header).setAttribute("aria-expanded", String(open));
      side.inert = narrow.matches && !open;
      behind().forEach((el) => (el.inert = open));
      if (open) $(".side-close", side).focus();
      else if (refocus && narrow.matches) toggle.focus();
    };
    setOpen(false, false);
    // Crossing the drawer breakpoint closes it, so it doesn't reappear open when narrowed again.
    narrow.addEventListener("change", () => setOpen(false, false));
    toggle.addEventListener("click", () => setOpen(true));
    $("[data-tab-menu]", header).addEventListener("click", () => setOpen(true));
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
    const col = (title, links) => links.length ? `<nav class="footer-col" aria-label="${e(title)}"><p class="footer-title">${e(title)}</p>
      <ul>${links.map(([href, label]) => `<li><a href="${e(href)}">${e(label)}</a></li>`).join("")}</ul></nav>` : "";
    footer.innerHTML = `
      <div class="wrap footer-grid">
        <div class="footer-brand">
          <a class="brand" href="/">${MARK}<span class="brand-name">Auto<b>Stacc</b></span></a>
          ${SITE.tagline ? `<p>${e(SITE.tagline)}</p>` : ""}
        </div>
        ${col("Explore", [["/shop", "Store"], ["/projects", "Projects"], ["/about", "About"], ["/studio", "Studio"]])}
        ${col("Help", [["/help", "Help"], ["/contact", "Contact"], ["/security", "Security"]])}
        ${col("Legal", [["/terms", "Terms"], ["/privacy", "Privacy"], ["/refunds", "Refunds"], ["/license", "Licences"]])}
        <p class="footer-legal">&copy; ${new Date().getFullYear()} ${e(SITE.name || "")}</p>
      </div>`;
  }

  // Anonymous page counter (GS.track: no cookies or ids; the admin's statistics read it).
  if (document.body.dataset.page && document.body.dataset.page !== "admin") GS.track("page_view", document.body.dataset.page);
})();

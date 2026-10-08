// Renders AutoStacc's frame on every page: the sidebar (AutoStacc: Store, Your Stacc, About; Projects: one link per
// project in data/projects.js), the top bar (menu button on phones, account, cart count, and the slot js/theme.js
// fills), on a project's pages its project bar (its pages as tabs, and the slot js/sound.js fills), the footer and the
// skip link. <body data-page> marks the current platform page; on a project's pages
// <body data-project="<id>" data-project-page="music"> marks the project and its page.
// Needs data/site.js, data/projects.js and js/util.js. Structured data is static, from scripts/build.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { $, escapeHTML: e, isSet } = GS;
  const SITE = window.SITE || {};
  const PROJECTS = (window.PROJECTS || []).filter((p) => !p.draft);
  const body = document.body.dataset;
  const PLATFORM = [["/shop", "Store", "shop", "store"], ["/library", "Your Stacc", "library", "stacc"], ["/about", "About", "about", "about"]];
  const projectHref = (p, path = "") => `/projects/${p.id}${path ? (path.startsWith("#") ? path : "/" + path) : ""}`;
  // Pages inside a section (a product, a release) light up their section's link without claiming to be it.
  const current = (key) => (key === body.page ? ' aria-current="page"' : key === body.section ? ' aria-current="true"' : "");
  const MARK = `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="10" y="12" width="36" height="10" rx="3"/><rect x="16" y="27" width="38" height="10" rx="3"/><rect x="10" y="42" width="30" height="10" rx="3"/><rect x="44" y="42" width="10" height="10" rx="3"/></svg>`;

  // Keyboard users can jump past the frame straight to the page content.
  const main = $("main");
  if (main) {
    main.id = main.id || "main";
    document.body.insertAdjacentHTML("afterbegin", `<a class="skip-link" href="#${main.id}">Skip to content</a>`);
    $(".skip-link").addEventListener("click", (ev) => {
      ev.preventDefault();
      main.tabIndex = -1;
      main.focus();
    });
  }

  // The sidebar lists each project once; its own pages are tabs in the project bar on its pages, not in the sidebar.
  const projectLink = (p) => `<li><a href="${e(projectHref(p))}"${body.project === p.id ? ' aria-current="true"' : ""}><span class="side-chip" aria-hidden="true"></span>${e(p.name)}</a></li>`;

  // On a project's pages: a bar under the top bar with its name, its pages as tabs and a slot for its own tools
  // (js/sound.js puts the sound switch there).
  function projectBar(p) {
    const tabs = (p.pages || [{ label: "Home", path: "" }]).map((pg) => {
      const on = !pg.path.startsWith("#") && (body.projectPage || "") === pg.path;
      return `<li><a href="${e(projectHref(p, pg.path))}"${on ? ' aria-current="page"' : ""}>${e(pg.label)}</a></li>`;
    }).join("");
    return `<nav class="project-bar" aria-label="${e(p.name)}">
        <span class="project-bar-name"><span class="side-chip" aria-hidden="true"></span>${e(p.name)}</span>
        <div class="project-bar-tools"></div>
        <ul class="project-tabs">${tabs}</ul>
      </nav>`;
  }
  const PROJECT = PROJECTS.find((p) => p.id === body.project);

  const header = $("#site-header");
  const footer = $("#site-footer");
  if (header) {
    header.className = "site-frame";
    header.innerHTML = `
      <div class="side" id="side" aria-label="Menu">
        <button class="side-close" type="button"><span aria-hidden="true">&times;</span><span class="sr-only">Close menu</span></button>
        <a class="brand" href="/"${body.page === "home" ? ' aria-current="page"' : ""}>${MARK}<span class="brand-name">Auto<b>Stacc</b></span></a>
        <nav class="side-nav" aria-label="Main">
          <p class="side-label" id="side-platform">AutoStacc</p>
          <ul aria-labelledby="side-platform">
            ${PLATFORM.map(([href, label, key, icon]) => `<li><a href="${href}"${current(key)}><span class="side-icon side-icon-${icon}" aria-hidden="true"></span>${label}</a></li>`).join("")}
          </ul>
          <p class="side-label" id="side-projects">Projects</p>
          <ul aria-labelledby="side-projects">
            ${PROJECTS.map(projectLink).join("")}
            <li><a href="/projects"${current("projects")}><span class="side-icon side-icon-all" aria-hidden="true"></span>All projects</a></li>
          </ul>
        </nav>
      </div>
      <div class="side-scrim" hidden></div>
      <div class="topbar">
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="side"><span class="menu-bars" aria-hidden="true"></span><span class="sr-only">Menu</span></button>
        <a class="topbar-brand" href="/" aria-label="${e(SITE.name || "Home")}, home">${MARK}</a>
        <div class="topbar-tools">
          <a class="tool-link" href="/account"${current("account")}>Account</a>
          <a class="tool-link cart-link" href="/cart"${current("cart")}>Cart<span class="cart-count" aria-hidden="true"></span><span class="sr-only cart-count-sr"></span></a>
        </div>
      </div>
      ${PROJECT ? projectBar(PROJECT) : ""}`;

    // On phones the sidebar is a drawer over the page. Closed, it is inert (no hidden links to Tab into); open, the
    // rest of the page is inert, focus moves into it, and the close button, Escape or the scrim close it.
    const toggle = $(".menu-toggle", header);
    const side = $(".side", header);
    const scrim = $(".side-scrim", header);
    const narrow = matchMedia("(max-width: 900px)");
    const behind = () => [$(".topbar", header), $(".project-bar", header), main, footer].filter(Boolean);
    const setOpen = (open, refocus = true) => {
      side.classList.toggle("open", open);
      scrim.hidden = !open;
      document.documentElement.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      side.inert = narrow.matches && !open;
      behind().forEach((el) => (el.inert = open));
      if (open) $(".side-close", side).focus();
      else if (refocus && narrow.matches) toggle.focus();
    };
    setOpen(false, false);
    // Widening past the drawer breakpoint closes it, so it doesn't reappear open when narrowed again.
    narrow.addEventListener("change", () => setOpen(false, false));
    toggle.addEventListener("click", () => setOpen(true));
    $(".side-close", side).addEventListener("click", () => setOpen(false));
    scrim.addEventListener("click", () => setOpen(false));
    side.addEventListener("click", (ev) => { if (ev.target.closest("a")) setOpen(false, false); });
    addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && side.classList.contains("open")) setOpen(false);
    });

    // Cart size from this browser's cart (js/util.js); updates live when anything is added or removed.
    const showCount = () => {
      const n = GS.cart.count();
      $(".cart-count", header).textContent = n ? ` ${n}` : "";
      $(".cart-count-sr", header).textContent = n ? `, ${n} item${n === 1 ? "" : "s"}` : "";
    };
    showCount();
    addEventListener("gs:cart", showCount);
    addEventListener("storage", (ev) => ev.key === "gs:cart" && showCount());
  }

  // Footer: AutoStacc's links; on a project's pages, that project's official profiles too.
  if (footer) {
    const project = PROJECT;
    const socials = project ? (project.socials || []).filter((s) => isSet(s.url)) : [];
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="wrap">
        ${project ? `<div class="footer-project"><span>${e(project.name)}</span>${socials.length ? `<div class="socials" role="group" aria-label="${e(project.name)} profiles">
          ${socials.map((s) => `<a href="${e(s.url)}" target="_blank" rel="me noopener">${e(s.name)}</a>`).join("")}</div>` : ""}</div>` : ""}
        <div class="footer-platform">
          <span>&copy; ${new Date().getFullYear()} ${e(SITE.name || "")}</span>
          <a href="/about">About</a><a href="/projects">Projects</a><a href="/shop">Store</a>
          ${SITE.email ? `<a href="mailto:${e(SITE.email)}">${e(SITE.email)}</a>` : ""}
        </div>
      </div>`;
  }
})();

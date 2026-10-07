// Renders the shared header (with skip link, account link and cart count) and footer. Needs data/site.js and js/util.js. Structured data is static, from scripts/build.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { $, escapeHTML, isSet } = GS;
  const SITE = window.SITE || {};

  const page = document.body.dataset.page;
  // Pages inside a section (a release, product or post) light up their section's link without claiming to be it.
  const section = document.body.dataset.section;
  // The logo links home, so the menu goes straight to what people come for. Clean addresses, as served in production.
  const links = [
    ["/music", "Music", "music"],
    ["/#shows", "Shows", "shows"],
    ["/shop", "Shop", "shop"],
    ["/news", "News", "news"],
    ["/#about", "About", "about"],
    ["/press", "Press", "press"],
    ["/projects", "Projects", "projects"],
    ["/account", "Account", "account"]
  ];
  const current = (key) =>
    key === page ? ' class="active" aria-current="page"' : key === section ? ' class="active" aria-current="true"' : "";
  const socials = (SITE.socials || []).filter((s) => isSet(s.url));

  // Keyboard users can jump past the header straight to the page content.
  const main = $("main");
  if (main) {
    main.id = main.id || "main";
    document.body.insertAdjacentHTML("afterbegin", `<a class="skip-link" href="#${main.id}">Skip to content</a>`);
    // Move focus by hand so it lands on the content in every browser without adding #main to the address.
    $(".skip-link").addEventListener("click", (e) => {
      e.preventDefault();
      main.tabIndex = -1;
      main.focus();
    });
  }

  const header = $("#site-header");
  if (header) {
    header.className = "site-header";
    header.innerHTML = `
      <div class="wrap">
        <a class="logo" href="/" aria-label="${escapeHTML(SITE.artist || "Home")}, home">GLITCHES<span aria-hidden="true">&amp;</span>STITCHES</a>
        <button class="nav-toggle" aria-expanded="false" aria-controls="nav" aria-label="Menu">[≡]</button>
        <nav class="nav" id="nav">
          ${links
            .map(([href, label, key]) => `<a href="${href}"${current(key)}>${label}</a>`)
            .join("")}
          <a class="cart-link" href="/cart"${current("cart")}>Cart<span class="cart-count" aria-hidden="true"></span><span class="sr-only cart-count-sr"></span></a>
        </nav>
      </div>`;
    const toggle = $(".nav-toggle", header);
    const nav = $(".nav", header);
    // On phones the menu covers the page below the header; the page behind it doesn't scroll.
    const setOpen = (open) => {
      nav.classList.toggle("open", open);
      document.documentElement.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "[×]" : "[≡]";
    };
    toggle.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
    // Cart size from this browser's cart (js/util.js); updates live when anything is added or removed.
    const showCount = () => {
      const n = GS.cart.count();
      $(".cart-count", header).textContent = n ? `[${n}]` : "";
      $(".cart-count-sr", header).textContent = n ? `, ${n} item${n === 1 ? "" : "s"}` : "";
    };
    showCount();
    addEventListener("gs:cart", showCount);
    addEventListener("storage", (e) => e.key === "gs:cart" && showCount());
    nav.addEventListener("click", (e) => {
      if (e.target.tagName === "A") setOpen(false);
    });
    // Escape closes the open menu and returns focus to its button.
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  const footer = $("#site-footer");
  if (footer) {
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="wrap">
        <div>
          &copy; ${new Date().getFullYear()} ${escapeHTML(SITE.artist || "")}
          &middot; <a href="/press">Press &amp; booking</a>
          ${SITE.platform ? ` &middot; on <a href="/projects">${escapeHTML(SITE.platform.name)}</a>` : ""}
          ${SITE.email ? ` &middot; <a href="mailto:${escapeHTML(SITE.email)}">${escapeHTML(SITE.email)}</a>` : ""}
        </div>
        <div class="socials" aria-label="Official profiles" role="group">
          ${socials.map((s) => `<a href="${escapeHTML(s.url)}" target="_blank" rel="me noopener">${escapeHTML(s.name)}</a>`).join("")}
        </div>
      </div>`;
  }
})();

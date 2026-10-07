// Renders the shared header (with skip link) and footer. Needs data/site.js and js/util.js. Structured data is static, from scripts/build.js.
(function () {
  "use strict";

  const { $, escapeHTML, isSet } = window.GS;
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
    ["/press", "Press", "press"]
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
        </nav>
      </div>`;
    const toggle = $(".nav-toggle", header);
    const nav = $(".nav", header);
    const setOpen = (open) => {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "[×]" : "[≡]";
    };
    toggle.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
    nav.addEventListener("click", (e) => {
      if (e.target.tagName === "A") setOpen(false);
    });
    // Escape closes the open menu and returns focus to its button.
    document.addEventListener("keydown", (e) => {
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
          ${SITE.email ? ` &middot; <a href="mailto:${escapeHTML(SITE.email)}">${escapeHTML(SITE.email)}</a>` : ""}
        </div>
        <div class="socials" aria-label="Official profiles" role="group">
          ${socials.map((s) => `<a href="${escapeHTML(s.url)}" target="_blank" rel="me noopener">${escapeHTML(s.name)}</a>`).join("")}
        </div>
      </div>`;
  }
})();

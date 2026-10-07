// Renders the shared header (with skip link) and footer, and the artist's structured data. Needs data/site.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, isSet, jsonLd } = window.GS;
  const SITE = window.SITE || {};

  const page = document.body.dataset.page;
  // The logo links home, so the menu goes straight to what people come for.
  const links = [
    ["home.html#listen", "Music", "music"],
    ["home.html#shows", "Shows", "shows"],
    ["shop.html", "Shop", "shop"],
    ["news.html", "News", "news"],
    ["home.html#about", "About", "about"],
    ["press.html", "Press", "press"]
  ];
  const socials = (SITE.socials || []).filter((s) => isSet(s.url));

  // Keyboard users can jump past the header straight to the page content.
  const main = $("main");
  if (main) {
    main.id = main.id || "main";
    document.body.insertAdjacentHTML("afterbegin", `<a class="skip-link" href="#${main.id}">Skip to content</a>`);
    // Move focus by hand so it also works on pages with a <base> tag (404.html).
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
        <a class="logo" href="home.html">GLITCHES<span>&amp;</span>STITCHES</a>
        <button class="nav-toggle" aria-expanded="false" aria-controls="nav" aria-label="Menu">[≡]</button>
        <nav class="nav" id="nav">
          ${links
            .map(([href, label, key]) => `<a href="${href}"${key === page ? ' class="active" aria-current="page"' : ""}>${label}</a>`)
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
  }

  const footer = $("#site-footer");
  if (footer) {
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="wrap">
        <div>
          &copy; ${new Date().getFullYear()} ${escapeHTML(SITE.artist || "")}
          &middot; <a href="press.html">Press &amp; booking</a>
          ${SITE.email ? ` &middot; <a href="mailto:${escapeHTML(SITE.email)}">${escapeHTML(SITE.email)}</a>` : ""}
        </div>
        <div class="socials">
          ${socials.map((s) => `<a href="${escapeHTML(s.url)}" target="_blank" rel="noopener">${escapeHTML(s.name)}</a>`).join("")}
        </div>
      </div>`;
  }

  // Tells search engines who the artist is (name, site, profiles). Profiles appear once their links are set.
  if (page === "home") {
    jsonLd({
      "@context": "https://schema.org",
      "@type": "MusicGroup",
      name: SITE.artist,
      url: SITE.url,
      genre: "Electronic",
      ...(socials.length && { sameAs: socials.map((s) => s.url) })
    });
  }
})();

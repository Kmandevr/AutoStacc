// Renders the shared header and footer. Needs data/site.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML } = window.GS;
  const SITE = window.SITE || {};

  const page = document.body.dataset.page;
  const links = [
    ["index.html", "Home", "home"],
    ["shop.html", "Shop", "shop"],
    ["news.html", "News", "news"],
    ["index.html#shows", "Shows", "shows"],
    ["index.html#about", "About", "about"]
  ];

  const header = $("#site-header");
  if (header) {
    header.className = "site-header";
    header.innerHTML = `
      <div class="wrap">
        <a class="logo" href="index.html">GLITCHES<span>&amp;</span>STITCHES</a>
        <button class="nav-toggle" aria-expanded="false" aria-controls="nav">Menu</button>
        <nav class="nav" id="nav">
          ${links
            .map(([href, label, key]) => `<a href="${href}"${key === page ? ' class="active"' : ""}>${label}</a>`)
            .join("")}
        </nav>
      </div>`;
    const toggle = $(".nav-toggle", header);
    const nav = $(".nav", header);
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (e) => {
      if (e.target.tagName === "A") nav.classList.remove("open");
    });
  }

  const footer = $("#site-footer");
  if (footer) {
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="wrap">
        <div>
          &copy; ${new Date().getFullYear()} ${escapeHTML(SITE.artist || "")}
          ${SITE.email ? ` &middot; <a href="mailto:${escapeHTML(SITE.email)}">${escapeHTML(SITE.email)}</a>` : ""}
        </div>
        <div class="socials">
          ${(SITE.socials || [])
            .map((s) => `<a href="${escapeHTML(s.url)}" target="_blank" rel="noopener">${escapeHTML(s.name)}</a>`)
            .join("")}
        </div>
      </div>`;
  }
})();

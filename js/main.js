// Renders the shared header/footer and any data-driven sections present on the page.
// Data lives in /data/*.js so the site works as plain static files (no build, no server).
(function () {
  "use strict";

  const SITE = window.SITE || {};
  const PRODUCTS = window.PRODUCTS || [];
  const NEWS = window.NEWS || [];
  const SHOWS = window.SHOWS || [];

  const $ = (sel, root = document) => root.querySelector(sel);

  const escapeHTML = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const money = (n) => "$" + Number(n).toFixed(2);

  // Dates are written as YYYY-MM-DD; parse as local time so they don't shift a day.
  const parseDate = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const fmtDate = (s, opts = { month: "short", day: "numeric", year: "numeric" }) =>
    parseDate(s).toLocaleDateString("en-US", opts);

  // ---------- header & footer ----------
  function renderChrome() {
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
  }

  // ---------- products ----------
  function coverStyle(hue) {
    const h2 = (hue + 60) % 360;
    return `background:
      linear-gradient(135deg, hsl(${hue} 90% 45% / .9), hsl(${h2} 90% 35% / .9)),
      repeating-linear-gradient(90deg, #000 0 8px, #222 8px 16px);`;
  }

  function productCard(p) {
    const available = Boolean(p.checkoutUrl);
    const button = available
      ? `<a class="btn" href="${escapeHTML(p.checkoutUrl)}" target="_blank" rel="noopener">Buy</a>`
      : `<span class="btn" aria-disabled="true">Coming soon</span>`;
    return `
      <article class="card">
        <div class="cover" style="${coverStyle(p.hue || 300)}"><span>${escapeHTML(p.title.split(" — ")[0])}</span></div>
        <div class="card-body">
          <span class="tag">${escapeHTML(p.category)}</span>
          <h3>${escapeHTML(p.title)}</h3>
          <p>${escapeHTML(p.description)}</p>
          <div class="card-foot">
            <span class="price">${money(p.price)}</span>
            ${button}
          </div>
        </div>
      </article>`;
  }

  function renderFeaturedProducts() {
    const el = $("#featured-products");
    if (!el) return;
    const items = PRODUCTS.filter((p) => p.featured).slice(0, 3);
    el.innerHTML = items.length ? items.map(productCard).join("") : `<p class="empty">Shop opening soon.</p>`;
  }

  function renderShop() {
    const el = $("#shop-grid");
    if (!el) return;
    const filters = $("#shop-filters");
    const categories = ["All", ...new Set(PRODUCTS.map((p) => p.category))];
    let current = "All";

    const draw = () => {
      const items = current === "All" ? PRODUCTS : PRODUCTS.filter((p) => p.category === current);
      el.innerHTML = items.length ? items.map(productCard).join("") : `<p class="empty">Nothing here yet.</p>`;
      filters.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.cat === current));
    };

    filters.innerHTML = categories
      .map((c) => `<button type="button" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`)
      .join("");
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      current = btn.dataset.cat;
      draw();
    });
    draw();
  }

  // ---------- news ----------
  function newsItem(n, full) {
    return `
      <article class="news-item">
        <div class="meta">
          <span class="tag">${escapeHTML(n.tag || "Update")}</span>
          <time datetime="${escapeHTML(n.date)}">${fmtDate(n.date)}</time>
        </div>
        <h3>${escapeHTML(n.title)}</h3>
        ${full && n.body ? `<div class="body">${n.body}</div>` : `<p>${escapeHTML(n.summary || "")}</p>`}
      </article>`;
  }

  function renderNews() {
    const sorted = [...NEWS].sort((a, b) => parseDate(b.date) - parseDate(a.date));
    const latest = $("#latest-news");
    if (latest) {
      latest.innerHTML = sorted.length
        ? sorted.slice(0, 3).map((n) => newsItem(n, false)).join("")
        : `<p class="empty">No updates yet.</p>`;
    }
    const all = $("#news-list");
    if (all) {
      all.innerHTML = sorted.length
        ? sorted.map((n) => newsItem(n, true)).join("")
        : `<p class="empty">No updates yet.</p>`;
    }
  }

  // ---------- shows ----------
  function renderShows() {
    const el = $("#show-list");
    if (!el) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = SHOWS.filter((s) => parseDate(s.date) >= today).sort(
      (a, b) => parseDate(a.date) - parseDate(b.date)
    );
    el.innerHTML = upcoming.length
      ? upcoming
          .map(
            (s) => `
        <div class="show">
          <time datetime="${escapeHTML(s.date)}">${fmtDate(s.date, { month: "short", day: "numeric" }).toUpperCase()}</time>
          <div class="where"><strong>${escapeHTML(s.city)}</strong><span>${escapeHTML(s.venue)}</span></div>
          ${
            s.ticketUrl
              ? `<a class="btn" href="${escapeHTML(s.ticketUrl)}" target="_blank" rel="noopener">Tickets</a>`
              : `<span class="btn" aria-disabled="true">Tickets soon</span>`
          }
        </div>`
          )
          .join("")
      : `<p class="empty" style="padding:18px 0">No upcoming shows. Check back soon.</p>`;
  }

  // ---------- newsletter ----------
  function setupNewsletter() {
    const form = $("#newsletter-form");
    if (!form) return;
    const msg = $("#newsletter-msg");
    if (SITE.newsletterAction) {
      form.action = SITE.newsletterAction;
      form.method = "post";
      return;
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      msg.textContent = "Mailing list is coming soon. Thanks for the interest!";
      form.reset();
    });
  }

  renderChrome();
  renderFeaturedProducts();
  renderShop();
  renderNews();
  renderShows();
  setupNewsletter();
})();

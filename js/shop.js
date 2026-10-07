// Renders product cards: the featured strip on the home page and the filterable shop grid.
// Needs data/products.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, money } = window.GS;
  const PRODUCTS = window.PRODUCTS || [];

  // The theme only has two colours, so the hue picks one: greens and blues glow green, the rest purple.
  function coverStyle(hue) {
    const tint = hue >= 90 && hue < 210 ? "51 255 102" : "191 95 255";
    return `background:
      radial-gradient(circle at 50% 40%, rgb(${tint} / .3), transparent 70%),
      repeating-linear-gradient(0deg, rgba(51,255,102,.07) 0 1px, transparent 1px 5px),
      #000;`;
  }

  function productCard(p) {
    const available = Boolean(p.checkoutUrl);
    const button = available
      ? `<a class="btn" href="${escapeHTML(p.checkoutUrl)}" target="_blank" rel="noopener">Buy</a>`
      : `<span class="btn" aria-disabled="true">Coming soon</span>`;
    return `
      <article class="card">
        <div class="cover" style="${coverStyle(p.hue ?? 300)}"><span>${escapeHTML(p.title.split(" — ")[0])}</span></div>
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
      filters.querySelectorAll("button").forEach((b) => {
        const on = b.dataset.cat === current;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
    };

    filters.innerHTML = categories
      .map((c) => `<button type="button" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`)
      .join("");
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      current = btn.dataset.cat;
      // Cross-fade to the new set of cards where the browser supports it (css/base.css), otherwise swap.
      document.startViewTransition ? document.startViewTransition(draw) : draw();
    });
    draw();
  }

  renderFeaturedProducts();
  renderShop();
})();

// Renders product cards: the featured strip on the home page and the filterable shop grid.
// Needs data/products.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, money } = window.GS;
  const PRODUCTS = window.PRODUCTS || [];

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
      draw();
    });
    draw();
  }

  renderFeaturedProducts();
  renderShop();
})();

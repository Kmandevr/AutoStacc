// Renders product cards (each linking to its page at /shop/<id>): the featured strip on the home page and the filterable shop grid.
// Needs data/product-types.js, data/products.js and js/util.js. Buttons, live prices and OWNED come from js/store.js.
(function () {
  "use strict";

  const { $, escapeHTML, money } = window.GS;
  const PRODUCTS = window.PRODUCTS || [];
  const TYPES = window.PRODUCT_TYPES || {};
  const label = (p) => (TYPES[p.type] || {}).label || p.type;

  // The theme only has two colours, so the hue picks one: greens and blues glow green, the rest purple.
  function coverStyle(hue) {
    const tint = hue >= 90 && hue < 210 ? "51 255 102" : "191 95 255";
    return `background:
      radial-gradient(circle at 50% 40%, rgb(${tint} / .3), transparent 70%),
      repeating-linear-gradient(0deg, rgba(51,255,102,.07) 0 1px, transparent 1px 5px),
      #000;`;
  }

  // `level`: the card's heading level, so it sits under the section it appears in (h2 on the shop, h3 on home).
  function productCard(p, level = 3) {
    // Static fallback; js/store.js swaps in the live control (Add to cart, OWNED, ...).
    const button = p.draft
      ? `<span class="btn" aria-disabled="true">Coming soon</span>`
      : `<button class="btn" type="button" data-add-to-cart="${escapeHTML(p.id)}">Add to cart</button>`;
    return `
      <article class="card">
        <div class="cover" style="${coverStyle(p.hue ?? 300)}"><span>${escapeHTML(p.title.split(" — ")[0])}</span></div>
        <div class="card-body">
          <span class="tag">${escapeHTML(label(p))}</span>
          <h${level}><a href="/shop/${escapeHTML(p.id)}">${escapeHTML(p.title)}</a></h${level}>
          <p>${escapeHTML(p.description)}</p>
          <div class="card-foot">
            <span class="price" data-price="${escapeHTML(p.id)}">${p.price ? money(p.price) : "Free"}</span>
            <div class="buy" data-buy="${escapeHTML(p.id)}">${button}</div>
          </div>
        </div>
      </article>`;
  }

  function renderFeaturedProducts() {
    const el = $("#featured-products");
    if (!el) return;
    const items = PRODUCTS.filter((p) => p.featured).slice(0, 3);
    el.innerHTML = items.length ? items.map((p) => productCard(p, 3)).join("") : `<p class="empty">Shop opening soon.</p>`;
  }

  function renderShop() {
    const el = $("#shop-grid");
    if (!el) return;
    const filters = $("#shop-filters");
    const categories = ["All", ...new Set(PRODUCTS.map(label))];
    let current = "All";

    const draw = () => {
      const items = current === "All" ? PRODUCTS : PRODUCTS.filter((p) => label(p) === current);
      el.innerHTML = items.length ? items.map((p) => productCard(p, 2)).join("") : `<p class="empty">Nothing here yet.</p>`;
      dispatchEvent(new CustomEvent("gs:cards"));
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

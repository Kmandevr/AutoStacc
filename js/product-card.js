// Product card template for js/shop.js (GS.productCard): one store item as a tile in its project's look, linking to the
// store filtered to its project with it selected. Needs js/util.js, data/product-types.js and data/projects.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { escapeHTML: e, money } = GS;
  const TYPES = window.PRODUCT_TYPES || {};
  const label = (p) => (TYPES[p.type] || {}).label || p.type;
  const projectName = (id) => ((window.PROJECTS || []).find((x) => x.id === id) || {}).name || "";
  // Generated covers: a track-colour tile in AutoStacc's look; a project's look restyles it (Glitches & Stitches: the
  // hue picks a green or purple glow).
  const tint = (hue = 300) => (hue >= 90 && hue < 210 ? "green" : "purple");

  // level: heading level, so the card sits under its section. selected: the item opened at the top of the store.
  function productCard(p, { level = 3, selected = false } = {}) {
    // Static fallback; js/store.js swaps in the live control (Add to cart, OWNED, ...).
    const button = p.draft
      ? `<span class="btn" aria-disabled="true">Coming soon</span>`
      : `<button class="btn" type="button" data-add-to-cart="${e(p.id)}">Add to cart</button>`;
    const by = projectName(p.project);
    return `
      <article class="card${selected ? " selected" : ""} ${GS.look(p.project)}" data-product="${e(p.id)}">
        <div class="cover tint-${tint(p.hue)}" data-track="${e((TYPES[p.type] || {}).track || "")}"><span>${e(p.title.split(" — ")[0])}</span></div>
        <div class="card-body">
          <span class="tag">${selected ? "Selected · " : ""}${e(label(p))}</span>
          <h${level}><a href="${e(GS.shopItemPath(p))}" data-select="${e(p.id)}">${e(p.title)}</a></h${level}>
          ${by ? `<p class="card-by">by ${e(by)}</p>` : ""}
          <p>${e(p.description)}</p>
          <a class="card-more" href="/shop/${e(p.id)}">Details<span class="sr-only"> about ${e(p.title)}</span></a>
          <div class="card-foot">
            <span class="price" data-price="${e(p.id)}">${p.price ? money(p.price) : "Free"}</span>
            <div class="buy" data-buy="${e(p.id)}">${button}</div>
          </div>
        </div>
      </article>`;
  }

  // One namespace: the template, with its type-label helper attached (shop.js builds the type filter from it).
  productCard.label = label;
  GS.productCard = productCard;
})();

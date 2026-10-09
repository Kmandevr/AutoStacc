// Product card template for js/shop.js (GS.productCard): one store item as a tile in its project's look, linking to the
// store filtered to its project with it selected. Studio products are marked "Unverified creator" until AutoStacc trusts
// their creator. Needs js/util.js, data/product-types.js and data/projects.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { escapeHTML: e, money } = GS;
  const TYPES = window.PRODUCT_TYPES || {};
  const label = (p) => (TYPES[p.type] || {}).label || p.type;
  const projectOf = (id) => (window.PROJECTS || []).find((x) => x.id === id) || {};
  const projectName = (id) => projectOf(id).name || "";
  // The genre label is the project's own (data/projects.js genres): products don't claim one of their own.
  const genre = (p) => (projectOf(p.project).genres || []).join(" · ");
  // Generated covers: a track-colour tile in AutoStacc's look; a project's look restyles it (Glitches & Stitches: the
  // hue picks a green or purple glow).
  const tint = (hue = 300) => (hue >= 90 && hue < 210 ? "green" : "purple");

  // level: heading level, so the card sits under its section. selected: the item opened large at the top of the store.
  // label: what the large card is called ("Selected" by default, "Featured" for the store's spotlight).
  // why: a short line saying why it's shown (personal picks).
  function productCard(p, { level = 3, selected = false, label: kicker = "Selected", why = "" } = {}) {
    // Static fallback; js/store.js swaps in the live control (Add to cart, OWNED, ...).
    const button = p.draft
      ? `<span class="btn" aria-disabled="true">Coming soon</span>`
      : `<button class="btn" type="button" data-add-to-cart="${e(p.id)}">Add to cart</button>`;
    // Studio products (from the store API) carry their project's name, their own page and whether the creator is verified.
    const by = p.projectName || projectName(p.project);
    const details = p.path || `/shop/${p.id}`;
    return `
      <article class="card${selected ? " selected" : ""} ${GS.look(p.project)}" data-product="${e(p.id)}">
        <a class="cover tint-${tint(p.hue)}" href="${e(GS.shopItemPath(p))}" data-select="${e(p.id)}" data-track="${e((TYPES[p.type] || {}).track || "")}" tabindex="-1" aria-hidden="true"><span>${e(p.title.split(" — ")[0])}</span></a>
        <div class="card-body">
          <span class="tag">${selected ? `${e(kicker)} · ` : ""}${e(label(p))}</span>${p.verified === false ? ' <span class="tag unverified" title="AutoStacc hasn\'t verified this creator">Unverified creator</span>' : ""}
          <h${level}><a href="${e(GS.shopItemPath(p))}" data-select="${e(p.id)}">${e(p.title)}</a></h${level}>
          ${by ? `<p class="card-by">by ${e(by)}</p>` : ""}
          ${why ? `<p class="card-why">${e(why)}</p>` : ""}
          <p class="card-desc">${e(p.description || "")}</p>
          <ul class="card-labels" aria-label="Details">
            ${(p.formats || []).map((f) => `<li class="label-format">${e(f)}</li>`).join("")}
            ${genre(p) ? `<li class="label-genre">${e(genre(p))}</li>` : ""}
            <li class="label-size" data-size="${e(p.id)}" hidden></li>
          </ul>
          <a class="card-more" href="${e(details)}">${selected ? "Everything about it" : "Details"}<span class="sr-only"> about ${e(p.title)}</span> →</a>
          <div class="card-foot">
            <span class="price" data-price="${e(p.id)}">${p.price ? money(p.price) : "Free"}</span>
            <div class="buy" data-buy="${e(p.id)}">${button}</div>
          </div>
        </div>
      </article>`;
  }

  // One namespace: the template, with its type-label helper attached (shop.js builds the type filter from it).
  productCard.label = label;
  productCard.genre = genre;
  GS.productCard = productCard;
})();

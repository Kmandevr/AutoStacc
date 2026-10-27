// Product card template (GS.productCard) for the store (js/store-browse.js, js/store-sections.js) and the product grids
// on other pages (js/shop.js): one item as a tile in its project's look, opening the product's own page. Takes either
// shape: a store API product (priceCents, sale, facets with labels, badges) or js/shop.js's short form of one (price in
// dollars; facets, if any, as values). Shows only what the data says: labels from its facets, "New", a running sale's percent off and
// a floor of recent confirmed sales. Studio products are marked "Unverified creator" until AutoStacc trusts their
// creator. Needs js/util.js, data/product-types.js and data/projects.js (data/vocabulary.js for labels of data entries).
(function () {
  "use strict";

  const GS = window.GS;
  const { escapeHTML: e, money, cents } = GS;
  const TYPES = window.PRODUCT_TYPES || {};
  const VOCAB = (window.VOCABULARY || {}).facets || {};
  const label = (p) => (TYPES[p.type] || {}).label || p.type;
  const projectOf = (id) => (window.PROJECTS || []).find((x) => x.id === id) || {};
  // Generated covers: a track-colour tile in AutoStacc's look; a project's look restyles it (Glitches & Stitches: the
  // hue picks a green or purple glow).
  const tint = (hue = 300) => (hue >= 90 && hue < 210 ? "green" : "purple");
  const SHOWN = ["contents", "format", "plugin", "daw", "genre", "style"];

  // [{ facet, label }] from either shape, most telling first, at most `max`.
  function labels(p, max = 4) {
    const out = [];
    for (const facet of SHOWN) {
      for (const x of (p.facets || {})[facet] || []) {
        const text = typeof x === "string" ? ((VOCAB[facet] || {}).values || {})[x] || x : x.label;
        if (!out.some((o) => o.label === text)) out.push({ facet, label: text });
      }
    }
    if (!p.facets || !p.facets.genre) {
      const g = projectOf(p.projectId || p.project).genres || [];
      if (g.length) out.push({ facet: "genre", label: g.join(" · ") });
    }
    return out.slice(0, max);
  }

  // level: heading level. selected: a large card (label names it, "Selected" by default). why: a line saying why it's
  // shown (recommendations). dismissable: adds "Not interested" (recommendation sections). wish: adds the wishlist heart
  // (only on pages that load js/wishlist.js, so it never sits there doing nothing). buy: false leaves out the buy control
  // (a product page's "You might also like" row, so the page has one buy button: its own). mixed: store-style sizes
  // (css/shop.css): a featured product is a wide banner card with its description and a preview button when it has a
  // clip; every other product is a capsule, its artwork with the title and price over it.
  function productCard(p, { level = 3, selected = false, label: kicker = "Selected", why = "", dismissable = false, wish = false, buy = true, mixed = false } = {}) {
    const project = p.projectId || p.project;
    const live = p.priceCents !== undefined;
    const priceText = live ? (p.free ? "Free" : `${p.sale ? `<s class="price-was">${e(cents(p.listPriceCents, p.currency))}</s> ` : ""}${e(cents(p.priceCents, p.currency))}`)
      : (p.price ? money(p.price) : "Free");
    // Static fallback; js/store.js swaps in the live control (Add to cart, STACC'D, ...).
    const button = live && p.comingSoon ? `<span class="btn ghost" aria-disabled="true">Coming soon</span>`
      : live && p.available === false
      ? `<span class="btn" aria-disabled="true">Unavailable</span>`
      : live && p.free ? `<button class="btn" type="button" data-claim="${e(p.id)}">Get it free</button>`
      : `<button class="btn" type="button" data-add-to-cart="${e(p.id)}">Add to cart</button>`;
    const by = p.projectName || projectOf(project).name || "";
    const href = GS.shopItemPath(p);
    const b = p.badges || {};
    const badges = [p.comingSoon ? "Coming soon" : "", b.new ? "New" : "", b.percentOff ? `${b.percentOff}% off` : "", b.soldRecently ? `${b.soldRecently}+ bought recently` : "",
      // Buyers' reviews (server/reviews/), only when there are any.
      p.rating ? `★ ${p.rating.average} (${p.rating.count} review${p.rating.count === 1 ? "" : "s"})` : ""].filter(Boolean);
    const art = p.artwork;
    const size = mixed ? (p.featured ? " feature" : " capsule") : "";
    // A data entry's clip is { file }, the store API's a URL.
    const clip = typeof p.preview === "string" ? p.preview : p.preview && p.preview.file ? `/media/previews/${p.preview.file}` : "";
    const listen = size === " feature" && clip
      ? `<button class="btn ghost card-listen" type="button" data-card-preview="${e(clip)}" aria-pressed="false">Preview<span class="sr-only">: ${e(p.title)}</span></button>` : "";
    const facts = [...labels(p).map((l) => `<li class="label-${l.facet}">${e(l.label)}</li>`),
      p.bpm ? `<li class="label-bpm">${p.bpm[0] === p.bpm[1] ? p.bpm[0] : `${p.bpm[0]}–${p.bpm[1]}`} BPM</li>` : ""];
    return `
      <article class="card${selected ? " selected" : ""}${size} ${GS.look(project)}" data-product="${e(p.id)}">
        <a class="cover tint-${tint(p.hue !== undefined ? p.hue : (p.metadata || {}).hue)}${art ? " has-art" : ""}" href="${e(href)}" data-track="${e((TYPES[p.type] || {}).track || "")}" tabindex="-1" aria-hidden="true">
          ${art ? `<img src="${e(art)}" alt="" loading="lazy" width="400" height="400">` : `<span>${e(p.title.split(" — ")[0])}</span>`}
          ${badges.length ? `<span class="card-badges">${badges.map((x) => `<em>${e(x)}</em>`).join("")}</span>` : ""}
        </a>
        ${wish ? `<button class="card-wish" type="button" data-wish="${e(p.id)}" aria-pressed="false" title="Save to your wishlist"><span class="sr-only">Save ${e(p.title)} to your wishlist</span></button>` : ""}
        <div class="card-body">
          <span class="tag">${selected ? `${e(kicker)} · ` : ""}${e(label(p))}</span>${p.verified === false ? ' <span class="tag unverified" title="AutoStacc hasn\'t verified this creator">Unverified creator</span>' : ""}
          <h${level}><a href="${e(href)}">${e(p.title)}</a></h${level}>
          ${by ? `<p class="card-by">by ${e(by)}</p>` : ""}
          ${why ? `<p class="card-why">${e(why)}</p>` : ""}
          <p class="card-desc">${e(p.description || "")}</p>
          <ul class="card-labels" aria-label="Details">${facts.join("")}<li class="label-size" data-size="${e(p.id)}" hidden></li></ul>
          <div class="card-foot">
            <span class="price" data-price="${e(p.id)}">${priceText}</span>
            ${listen}
            ${buy ? `<div class="buy" data-buy="${e(p.id)}">${button}</div>` : `<a class="btn ghost" href="${e(href)}">See it<span class="sr-only">: ${e(p.title)}</span></a>`}
          </div>
          ${dismissable ? `<button class="card-dismiss" type="button" data-dismiss="${e(p.id)}">Not interested<span class="sr-only"> in ${e(p.title)}</span></button>` : ""}
        </div>
      </article>`;
  }

  // Banner cards' Preview buttons: one clip plays at a time; pressing the playing one again stops it.
  let player = null, playing = null;
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-card-preview]");
    if (!btn) return;
    player = player || new Audio();
    const again = playing === btn;
    player.pause();
    if (playing) { playing.setAttribute("aria-pressed", "false"); playing = null; }
    if (again) return;
    player.src = btn.dataset.cardPreview;
    player.onended = () => { btn.setAttribute("aria-pressed", "false"); playing = null; };
    player.play().then(() => { btn.setAttribute("aria-pressed", "true"); playing = btn; }).catch(() => {});
  });

  // One namespace: the template, with its type-label helper attached.
  productCard.label = label;
  GS.productCard = productCard;
})();

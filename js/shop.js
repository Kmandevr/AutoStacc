// Product grids for pages other than the store (home page, a project's home): drop-in cards configured by attributes
// on any element with [data-shop]:
//   data-project="<id>"      only that project's items (else every project's)
//   data-featured            only featured items;  data-limit="3"  at most that many
//   data-level="2"           card heading level (default 3)
//   data-mixed               store-style card sizes (js/product-card.js): a featured-only grid opens with one banner
// Each card opens the product's own page. The store itself (/shop: search, filters, sections) is js/store-browse.js.
// Creators' (Studio) products come from the store API and join the grid once it answers, each marked "Unverified
// creator" until AutoStacc trusts its creator; with the store offline the grid shows data/products.js (empty now: first-party products are made in the Studio) or its empty state.
// Needs data/projects.js, data/product-types.js, data/products.js, js/util.js and js/product-card.js. Buttons, live
// prices and STACC'D come from js/store.js (it listens for gs:cards).
(function () {
  "use strict";

  const GS = window.GS;
  const PRODUCTS = window.PRODUCTS || [];
  const card = GS.productCard;
  if (!card) return;

  // Studio products, in the shape data/products.js uses, fetched once per page for every grid.
  let studio = null;
  const studioProducts = () => studio || (studio = GS.api("/api/products").then((res) => (res.ok ? res.data.products : [])
    .filter((p) => p.source === "studio")
    .map((p) => ({ id: p.id, title: p.title, description: p.description, type: p.type, price: p.priceCents / 100, project: p.projectId,
      projectName: p.projectName, projectPath: p.projectPath, path: p.path, verified: p.verified, featured: p.featured }))));

  function mount(root) {
    const cfg = root.dataset;
    const level = Number(cfg.level) || 3;
    const wanted = (p) => (!cfg.project || p.project === cfg.project) && (!("featured" in cfg) || p.featured);
    const draw = (list) => {
      let items = list.filter(wanted);
      if (cfg.limit) items = items.slice(0, Number(cfg.limit));
      // data-mixed: store-style sizes; in a featured-only grid the first is the banner and the rest are capsules.
      const mixed = "mixed" in cfg, top = (p, i) => ("featured" in cfg ? { ...p, featured: i === 0 } : p);
      root.innerHTML = `<div class="grid">${items.map((p, i) => card(mixed ? top(p, i) : p, { level, mixed })).join("") || `<p class="empty">Nothing here yet.</p>`}</div>`;
      dispatchEvent(new CustomEvent("gs:cards"));
    };
    draw(PRODUCTS);
    studioProducts().then((list) => { if (list.length) draw([...PRODUCTS, ...list]); });
  }

  document.querySelectorAll("[data-shop]").forEach(mount);
})();

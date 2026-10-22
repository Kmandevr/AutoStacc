// Product grids for pages other than the store (home page, a project's home): drop-in cards configured by attributes
// on any element with [data-shop]:
//   data-project="<id>"      only that project's items (else every project's)
//   data-featured            only featured items;  data-limit="3"  at most that many
//   data-level="2"           card heading level (default 3)
//   data-mixed               store-style card sizes (js/product-card.js): a featured-only grid opens with one banner
// Each card opens the product's own page. The store itself (/shop: search, filters, sections) is js/store-browse.js.
// Products come from the store API (made in the Studio, every creator's), each marked "Unverified creator" until
// AutoStacc trusts its creator; with the store offline the grid shows its empty state (no products are defined in code, #176). Needs data/projects.js, data/product-types.js, js/util.js and js/product-card.js (js/skeleton.js optional). Buttons, live
// prices and STACC'D come from js/store.js (it listens for gs:cards).
(function () {
  "use strict";

  const GS = window.GS;
  const card = GS.productCard, sk = GS.skeleton;
  if (!card) return;

  // The store's products, in the shape js/product-card.js takes (price in dollars), fetched once per page for every grid.
  let loaded = null;
  // null when the store doesn't answer (offline), so the box can say so instead of "nothing here".
  const products = () => loaded || (loaded = GS.api("/api/products").then((res) => (res.ok ? res.data.products : null) && res.data.products
    .map((p) => ({ id: p.id, title: p.title, description: p.description, type: p.type, price: p.priceCents / 100, project: p.projectId,
      projectName: p.projectName, projectPath: p.projectPath, path: p.path, artwork: p.artwork, verified: p.verified, featured: p.featured }))));

  function mount(root) {
    const cfg = root.dataset;
    const level = Number(cfg.level) || 3;
    const wanted = (p) => (!cfg.project || p.project === cfg.project) && (!("featured" in cfg) || p.featured);
    const draw = (list) => {
      let items = (list || []).filter(wanted);
      if (cfg.limit) items = items.slice(0, Number(cfg.limit));
      // data-mixed: store-style sizes; in a featured-only grid the first is the banner and the rest are capsules.
      const mixed = "mixed" in cfg, top = (p, i) => ("featured" in cfg ? { ...p, featured: i === 0 } : p);
      root.innerHTML = `<div class="grid">${items.map((p, i) => card(mixed ? top(p, i) : p, { level, mixed })).join("") || `<p class="empty">${list ? "Nothing here yet." : 'The store is offline right now. <a href="/shop">Open the store</a>'}</p>`}</div>`;
      dispatchEvent(new CustomEvent("gs:cards"));
    };
    // Placeholder cards in the grid's own slots while the store answers (js/skeleton.js, when loaded).
    root.setAttribute("aria-busy", "true");
    if (sk) { root.innerHTML = `<div class="grid"></div>`; sk.show(root.firstElementChild, "card", Math.min(Number(cfg.limit) || 3, 6)); }
    products().then((list) => { root.removeAttribute("aria-busy"); draw(list); });
  }

  document.querySelectorAll("[data-shop]").forEach(mount);
})();

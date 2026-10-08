// Store browser: drop-in grids of product cards, configured by attributes on any element with [data-shop]:
//   data-project="<id>"      only that project's items (else every project's)
//   data-featured            only featured items;  data-limit="3"  at most that many
//   data-filters="project type"  filter bars to show;  data-level="2"  card heading level (default 3)
//   data-url                 the store page: filters and the selected item live in the address
//                            (/shop?project=<id>&type=<type>&item=<id>); clicking a card selects it in place.
// Elsewhere, clicking a card opens the store filtered to its project with that item selected at the top.
// Needs data/projects.js, data/product-types.js, data/products.js, js/util.js and js/product-card.js. Buttons, live
// prices and OWNED come from js/store.js (it listens for gs:cards).
(function () {
  "use strict";

  const GS = window.GS;
  const { $, escapeHTML: e } = GS;
  const PRODUCTS = window.PRODUCTS || [];
  const PROJECTS = (window.PROJECTS || []).filter((p) => !p.draft);
  const card = GS.productCard;
  if (!card) return;

  function mount(root) {
    const cfg = root.dataset;
    const filters = (cfg.filters || "").split(/\s+/).filter(Boolean);
    const level = Number(cfg.level) || 3;
    const synced = "url" in cfg;
    let base = PRODUCTS.filter((p) => (!cfg.project || p.project === cfg.project) && (!("featured" in cfg) || p.featured));
    if (cfg.limit) base = base.slice(0, Number(cfg.limit));
    const projects = PROJECTS.filter((x) => base.some((p) => p.project === x.id));
    const types = [...new Set(base.map(card.label))];
    const state = { project: "", type: "", item: "" };

    root.innerHTML = `
      ${filters.includes("project") && projects.length && !cfg.project ? `<div class="filters" role="group" aria-label="Project" data-filter="project"></div>` : ""}
      ${filters.includes("type") && types.length > 1 ? `<div class="filters" role="group" aria-label="Type" data-filter="type"></div>` : ""}
      <p class="shop-from small-print" hidden></p>
      <div class="shop-selected"></div>
      <div class="grid"></div>`;
    const bar = (kind, options) => {
      const el = $(`[data-filter=${kind}]`, root);
      if (!el) return;
      el.innerHTML = [["", kind === "project" ? "All projects" : "All"], ...options].map(([value, text]) => {
        const on = state[kind] === value;
        return `<button type="button" data-value="${e(value)}" aria-pressed="${on}"${on ? ' class="active"' : ""}>${e(text)}</button>`;
      }).join("");
    };

    const draw = () => {
      const items = base.filter((p) => (!state.project || p.project === state.project) && (!state.type || card.label(p) === state.type));
      const picked = items.find((p) => p.id === state.item);
      $(".shop-selected", root).innerHTML = picked ? card(picked, { level, selected: true }) : "";
      $(".grid", root).innerHTML = items.filter((p) => p !== picked).map((p) => card(p, { level })).join("")
        || (picked ? "" : `<p class="empty">Nothing here yet.</p>`);
      const from = $(".shop-from", root);
      const proj = PROJECTS.find((x) => x.id === state.project);
      from.hidden = !proj || Boolean(cfg.project);
      if (proj) from.innerHTML = `Showing items from <a href="${e(GS.projectPath(proj.id))}">${e(proj.name)}</a>.`;
      bar("project", projects.map((x) => [x.id, x.name]));
      bar("type", types.map((t) => [t, t]));
      dispatchEvent(new CustomEvent("gs:cards"));
    };
    const swap = (fn) => (document.startViewTransition ? document.startViewTransition(fn) : fn());
    const fromUrl = () => {
      const q = new URLSearchParams(location.search);
      state.project = projects.some((x) => x.id === q.get("project")) ? q.get("project") : "";
      state.type = types.includes(q.get("type")) ? q.get("type") : "";
      state.item = base.some((p) => p.id === q.get("item")) ? q.get("item") : "";
    };
    const toUrl = () => {
      const q = new URLSearchParams();
      for (const k of ["project", "type", "item"]) if (state[k]) q.set(k, state[k]);
      history.pushState(null, "", location.pathname + (q.toString() ? "?" + q : ""));
    };

    root.addEventListener("click", (ev) => {
      const f = ev.target.closest("[data-filter] button");
      if (f) {
        state[f.parentElement.dataset.filter] = f.dataset.value;
        state.item = "";
        if (synced) toUrl();
        return swap(draw);
      }
      const pick = ev.target.closest("[data-select]");
      if (!pick || !synced || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
      ev.preventDefault();
      const p = base.find((x) => x.id === pick.dataset.select);
      Object.assign(state, { project: p.project, type: "", item: p.id });
      toUrl();
      draw(); // at once (no transition), so the selected card can be scrolled to and focused
      const sel = $(".shop-selected .card", root);
      if (sel) {
        sel.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        $("[data-select]", sel).focus({ preventScroll: true });
      }
    });
    if (synced) {
      fromUrl();
      addEventListener("popstate", () => { fromUrl(); swap(draw); });
    }
    draw();
  }

  document.querySelectorAll("[data-shop]").forEach(mount);
})();

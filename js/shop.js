// Store browser: drop-in grids of product cards, configured by attributes on any element with [data-shop]:
//   data-project="<id>"      only that project's items (else every project's)
//   data-featured            only featured items;  data-limit="3"  at most that many
//   data-filters="project type"  filter bars to show (each option shows how many items it holds)
//   data-search              a search box over titles, descriptions, tags, types and project names
//   data-spotlight           with nothing filtered, the first featured item opens large at the top
//   data-level="2"           card heading level (default 3)
//   data-url                 the store page: filters, search and the selected item live in the address
//                            (/shop?project=<id>&type=<type>&q=<text>&item=<id>); clicking a card selects it in place.
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
  const projectName = (id) => (PROJECTS.find((x) => x.id === id) || {}).name || "";
  const plural = (n) => `${n} item${n === 1 ? "" : "s"}`;

  function mount(root) {
    const cfg = root.dataset;
    const filters = (cfg.filters || "").split(/\s+/).filter(Boolean);
    const level = Number(cfg.level) || 3;
    const synced = "url" in cfg;
    let base = PRODUCTS.filter((p) => (!cfg.project || p.project === cfg.project) && (!("featured" in cfg) || p.featured));
    if (cfg.limit) base = base.slice(0, Number(cfg.limit));
    const projects = PROJECTS.filter((x) => base.some((p) => p.project === x.id));
    const types = [...new Set(base.map(card.label))];
    const state = { project: "", type: "", q: "", item: "" };
    // Lower-case text each item is searched by.
    const haystack = new Map(base.map((p) => [p, [p.title, p.description, card.label(p), projectName(p.project), ...(p.tags || [])].join(" ").toLowerCase()]));
    const spot = "spotlight" in cfg && base.find((p) => p.featured);

    root.innerHTML = `
      ${"search" in cfg ? `<div class="shop-search" role="search">
        <label for="shop-q" class="sr-only">Search the store</label>
        <input id="shop-q" type="search" placeholder="Search packs, presets, stems, projects…" autocomplete="off" enterkeyhint="search">
      </div>` : ""}
      ${filters.includes("project") && projects.length && !cfg.project ? `<div class="filters" role="group" aria-label="Project" data-filter="project"></div>` : ""}
      ${filters.includes("type") && types.length > 1 ? `<div class="filters" role="group" aria-label="Type" data-filter="type"></div>` : ""}
      <p class="shop-from small-print" hidden></p>
      <div class="shop-spotlight"></div>
      <div class="shop-selected"></div>
      ${synced ? `<div class="shop-results"><p class="shop-count" aria-live="polite"></p><button type="button" class="shop-clear" data-clear hidden>Clear filters</button></div>` : ""}
      <div class="grid"></div>`;
    const input = $("#shop-q", root);

    // Items that pass every filter except `skip`, so each filter option can say how many it would show.
    const matching = (skip) => base.filter((p) => (skip === "project" || !state.project || p.project === state.project)
      && (skip === "type" || !state.type || card.label(p) === state.type)
      && (!state.q || state.q.toLowerCase().split(/\s+/).every((w) => haystack.get(p).includes(w))));
    const bar = (kind, options) => {
      const el = $(`[data-filter=${kind}]`, root);
      if (!el) return;
      const pool = matching(kind);
      const count = (value) => pool.filter((p) => !value || (kind === "project" ? p.project : card.label(p)) === value).length;
      el.innerHTML = [["", kind === "project" ? "All projects" : "All types"], ...options].map(([value, text]) => {
        const on = state[kind] === value;
        return `<button type="button" data-value="${e(value)}" aria-pressed="${on}"${on ? ' class="active"' : ""}>${e(text)} <span class="filter-count">${count(value)}</span></button>`;
      }).join("");
    };

    const draw = () => {
      const items = matching();
      const filtered = Boolean(state.project || state.type || state.q);
      const picked = items.find((p) => p.id === state.item);
      const lead = !filtered && !picked && spot;
      $(".shop-spotlight", root).innerHTML = lead
        ? `<p class="shop-label">Featured</p>${card(lead, { level, selected: true, label: "Featured" })}` : "";
      $(".shop-selected", root).innerHTML = picked ? card(picked, { level, selected: true }) : "";
      const rest = items.filter((p) => p !== picked && p !== lead);
      $(".grid", root).innerHTML = rest.map((p) => card(p, { level })).join("")
        || (picked || lead ? "" : state.q
          ? `<div class="empty shop-empty"><p>Nothing matches “${e(state.q)}”.</p><button type="button" class="btn ghost" data-clear>Clear the search</button></div>`
          : `<p class="empty">Nothing here yet.</p>`);
      const count = $(".shop-count", root);
      if (count) {
        count.textContent = filtered ? `${plural(items.length)} found` : `${plural(base.length)} from ${projects.length} project${projects.length === 1 ? "" : "s"}`;
        $(".shop-results [data-clear]", root).hidden = !filtered;
      }
      const from = $(".shop-from", root);
      const proj = PROJECTS.find((x) => x.id === state.project);
      from.hidden = !proj || Boolean(cfg.project);
      if (proj) from.innerHTML = `Showing items from <a href="${e(GS.projectPath(proj.id))}">${e(proj.name)}</a>.`;
      bar("project", projects.map((x) => [x.id, x.name]));
      bar("type", types.map((t) => [t, t]));
      dispatchEvent(new CustomEvent("gs:cards"));
    };
    const swap = GS.viewSwap;
    const fromUrl = () => {
      const q = new URLSearchParams(location.search);
      state.project = projects.some((x) => x.id === q.get("project")) ? q.get("project") : "";
      state.type = types.includes(q.get("type")) ? q.get("type") : "";
      state.q = input ? (q.get("q") || "").slice(0, 80) : "";
      state.item = base.some((p) => p.id === q.get("item")) ? q.get("item") : "";
      if (input) input.value = state.q;
    };
    const toUrl = (replace) => {
      const q = new URLSearchParams();
      for (const k of ["project", "type", "q", "item"]) if (state[k]) q.set(k, state[k]);
      history[replace ? "replaceState" : "pushState"](null, "", location.pathname + (q.toString() ? "?" + q : ""));
    };

    root.addEventListener("click", (ev) => {
      const f = ev.target.closest("[data-filter] button");
      if (f) {
        state[f.parentElement.dataset.filter] = f.dataset.value;
        state.item = "";
        if (synced) toUrl();
        return swap(draw);
      }
      if (ev.target.closest("[data-clear]")) {
        Object.assign(state, { project: "", type: "", q: "", item: "" });
        if (input) { input.value = ""; input.focus(); }
        if (synced) toUrl();
        return swap(draw);
      }
      const pick = ev.target.closest("[data-select]");
      if (!pick || !synced || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
      ev.preventDefault();
      const p = base.find((x) => x.id === pick.dataset.select);
      Object.assign(state, { project: p.project, type: "", q: "", item: p.id });
      if (input) input.value = "";
      toUrl();
      draw(); // at once (no transition), so the selected card can be scrolled to and focused
      const sel = $(".shop-selected .card", root);
      if (sel) {
        sel.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        $(":is(h2, h3, h4) [data-select]", sel).focus({ preventScroll: true });
      }
    });
    // Typing filters as you go; the address follows without filling the history with every letter.
    let typing;
    if (input) input.addEventListener("input", () => {
      clearTimeout(typing);
      typing = setTimeout(() => {
        state.q = input.value.trim().slice(0, 80);
        state.item = "";
        if (synced) toUrl(true);
        draw();
      }, 120);
    });
    if (synced) {
      fromUrl();
      addEventListener("popstate", () => { fromUrl(); swap(draw); });
    }
    draw();
  }

  document.querySelectorAll("[data-shop]").forEach(mount);
})();

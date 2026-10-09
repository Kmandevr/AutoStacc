// Store browser: drop-in grids of product cards, configured by attributes on any element with [data-shop]:
//   data-project="<id>"      only that project's items (else every project's)
//   data-featured            only featured items;  data-limit="3"  at most that many
//   data-filters="project type"  filter bars to show (each option shows how many items it holds)
//   data-search              a search box over titles, descriptions, tags, types and project names
//   data-spotlight           with nothing filtered, the first featured item opens large at the top
//   data-picks="3"           with nothing filtered, a "Picked for you" row from js/taste.js (this browser's history)
//   data-sort                a sort menu: recommended (personal when picks are on), price, name
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
  const SORTS = [["", "Recommended"], ["price-asc", "Price: low to high"], ["price-desc", "Price: high to low"], ["name", "Name"]];
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
    const state = { project: "", type: "", q: "", item: "", sort: "" };
    const taste = "picks" in cfg && GS.taste;
    root.dataset.catalog = base.map((p) => p.id).join(","); // for js/store.js: live state for every item, drawn or not
    // Lower-case text each item is searched by.
    const haystack = new Map(base.map((p) => [p, [p.title, p.description, card.label(p), projectName(p.project), card.genre(p), ...(p.tags || []), ...(p.formats || [])].join(" ").toLowerCase()]));
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
      ${taste ? `<section class="shop-foryou" aria-labelledby="foryou-head"></section>` : ""}
      <div class="shop-selected"></div>
      ${synced ? `<div class="shop-results"><p class="shop-count" aria-live="polite"></p><button type="button" class="shop-clear" data-clear hidden>Clear filters</button>
        ${"sort" in cfg ? `<label class="shop-sort">Sort <select data-sort>${SORTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>` : ""}</div>` : ""}
      <div class="grid shop-grid"></div>`;
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

    const order = (items) => {
      const by = { "price-asc": (a, b) => a.price - b.price, "price-desc": (a, b) => b.price - a.price, name: (a, b) => a.title.localeCompare(b.title) }[state.sort];
      return by ? [...items].sort(by) : taste ? taste.rank(items, card.label) : items;
    };
    // Personal picks: a few cards with why each is shown, or a line to switch them back on. Nothing without history.
    const picks = (show) => {
      const el = $(".shop-foryou", root);
      if (!el) return;
      if (!show) { el.innerHTML = ""; return; }
      if (!taste.enabled()) {
        el.innerHTML = `<p class="small-print shop-foryou-off" id="foryou-head">Personal picks are off. <button type="button" class="shop-clear" data-taste="on">Turn them on</button></p>`;
        return;
      }
      const list = taste.picks(base, Number(cfg.picks) || 3, { typeLabel: card.label, skip: (p) => p === spot || GS.cart.has(p.id) });
      el.innerHTML = list.length ? `<div class="shop-foryou-head"><h${level} class="shop-label" id="foryou-head">Picked for you</h${level}>
          <p class="small-print">From what you've opened and added to your cart here, kept only in this browser.
            <button type="button" class="shop-clear" data-taste="reset">Forget it</button> <button type="button" class="shop-clear" data-taste="off">Turn off</button></p></div>
        <div class="shop-picks">${list.map((x) => card(x.p, { level: level + 1, why: x.reason })).join("")}</div>` : "";
    };

    const draw = () => {
      const items = order(matching());
      const filtered = Boolean(state.project || state.type || state.q);
      const picked = items.find((p) => p.id === state.item);
      const lead = !filtered && !picked && spot;
      $(".shop-spotlight", root).innerHTML = lead
        ? `<p class="shop-label">Featured</p>${card(lead, { level, selected: true, label: "Featured" })}` : "";
      $(".shop-selected", root).innerHTML = picked ? card(picked, { level, selected: true }) : "";
      const rest = items.filter((p) => p !== picked && p !== lead);
      picks(!filtered && !picked);
      $(".shop-grid", root).innerHTML = rest.map((p) => card(p, { level })).join("")
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
      state.sort = SORTS.some(([v]) => v && v === q.get("sort")) ? q.get("sort") : "";
      if (input) input.value = state.q;
      const sorter = $("[data-sort]", root);
      if (sorter) sorter.value = state.sort;
    };
    const toUrl = (replace) => {
      const q = new URLSearchParams();
      for (const k of ["project", "type", "q", "item", "sort"]) if (state[k]) q.set(k, state[k]);
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
      const t = ev.target.closest("[data-taste]");
      if (t) {
        const how = t.dataset.taste;
        if (how === "reset") taste.reset(); else taste.set(how === "on");
        draw();
        // The pressed button is gone after the redraw: keep focus near it.
        const near = $("#foryou-head", root) || input;
        if (near) { if (near !== input) near.tabIndex = -1; near.focus({ preventScroll: true }); }
        return;
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
    root.addEventListener("change", (ev) => {
      if (!ev.target.matches("[data-sort]")) return;
      state.sort = ev.target.value;
      if (synced) toUrl(true);
      swap(draw);
    });
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

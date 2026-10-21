// The store page's browser ([data-browse] on /shop): search, categories, the filter panel (a drawer on phones), active
// filters as chips, sorting and pages, all answered by GET /api/store/search (the server filters, counts and pages; the
// browser never loads the catalog). The address holds the whole state (/shop?q=&category=&genre=a,b&price_max=&sort=
// &page=), so Back, reload and a shared link all land on the same results, and returning from a product keeps them.
// Filter and search choices go to js/taste.js (gs:taste) for recommendations; gs:store-view tells the recommendation
// sections whether anything is narrowed (they hide while it is). Offline, it shows an empty state (no products are defined
// in code, #176). Needs js/util.js, js/product-card.js, js/store-filters.js, data/product-types.js, data/vocabulary.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { $, escapeHTML: e, api } = GS;
  const root = $("[data-browse]");
  if (!root || !GS.productCard || !GS.storeFilters) return;
  const card = GS.productCard, F = GS.storeFilters;
  const KEYS = new Set(["q", "category", "creator", "price_min", "price_max", "free", "sale", "new", "rating_min", "bpm_min", "bpm_max", "sort", "page",
    ...Object.keys((window.VOCABULARY || {}).facets || {})]);
  const SORTS = [["relevance", "Relevance"], ["bestselling", "Best-selling"], ["rating", "Top rated"], ["newest", "Newest"], ["price-asc", "Price: low to high"],
    ["price-desc", "Price: high to low"], ["discount", "Biggest discount"], ["name", "Name"]];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");

  // The address's parameters that mean something here (old "project" links mean creator).
  function fromAddress() {
    const p = new URLSearchParams();
    for (const [k, v] of new URLSearchParams(location.search)) {
      const key = k === "project" ? "creator" : k;
      if (KEYS.has(key) && v && (key !== "page" || /^\d{1,3}$/.test(v))) p.set(key, v);
    }
    return p;
  }
  let params = fromAddress();
  let last = null, seq = 0;

  root.innerHTML = `
    <form class="browse-search" role="search" data-search-form>
      <label for="store-q" class="sr-only">Search the store</label>
      <input id="store-q" name="q" type="search" placeholder="Search sample packs, presets, genres, creators…" autocomplete="off" enterkeyhint="search"
        maxlength="100" data-suggest aria-describedby="store-q-hint">
      <button class="btn" type="submit">Search</button>
      <p id="store-q-hint" class="sr-only">Suggestions appear as you type; use the arrow keys to pick one.</p>
    </form>
    <nav class="browse-cats" aria-label="Categories"></nav>
    <div class="browse-layout">
      <div class="browse-scrim" data-close-filters hidden></div>
      <aside class="browse-filters" id="browse-filters" aria-label="Filters" tabindex="-1">
        <div class="browse-filters-head"><p class="browse-filters-title">Filters</p><button type="button" class="btn ghost small" data-close-filters>Done</button></div>
        <div data-panel></div>
      </aside>
      <div class="browse-main">
        <div class="browse-bar">
          <button type="button" class="btn ghost browse-filter-toggle" aria-controls="browse-filters" aria-expanded="false" data-open-filters>Filters</button>
          <p class="browse-count" aria-live="polite"></p>
          <label class="browse-sort" for="store-sort">Sort <select id="store-sort" data-sort>${SORTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>
        </div>
        <div class="browse-chips" data-chips></div>
        <div data-sections-slot></div>
        <h2 class="browse-results-head" id="browse-results-head" tabindex="-1">All products</h2>
        <div class="grid browse-grid" aria-labelledby="browse-results-head" aria-busy="false"></div>
        <nav class="browse-pages" aria-label="Result pages"></nav>
      </div>
    </div>`;
  // The recommendation sections (js/store-sections.js) live in the results column above the grid.
  const sections = $("[data-store-sections]");
  if (sections) $("[data-sections-slot]", root).replaceWith(sections);
  const grid = $(".browse-grid", root), input = $("#store-q", root);

  const narrowed = () => [...params.keys()].some((k) => !["sort", "page"].includes(k));
  const listOf = (k) => (params.get(k) || "").split(",").filter(Boolean);
  const setList = (k, list) => (list.length ? params.set(k, list.join(",")) : params.delete(k));

  function go({ push = true, keepPage = false } = {}) {
    if (!keepPage) params.delete("page");
    const qs = params.toString();
    history[push ? "pushState" : "replaceState"](null, "", location.pathname + (qs ? `?${qs}` : ""));
    load();
  }

  // Keeps focus on the same control (by id) across a redraw of the panel or chips.
  function redraw(fn) {
    const id = document.activeElement && document.activeElement.id;
    fn();
    const again = id && document.getElementById(id);
    if (again && again !== document.activeElement) again.focus({ preventScroll: true });
  }

  function render(d) {
    last = d;
    const chips = F.chips(d, params);
    redraw(() => {
      $("[data-panel]", root).innerHTML = F.panel(d, params);
      $("[data-chips]", root).innerHTML = chips.length ? `${F.chipsHTML(chips)}<button type="button" class="chip-clear" data-clear-all>Clear all</button>` : "";
      const total = d.categories.reduce((s, c) => s + c.count, 0);
      const cats = listOf("category");
      $(".browse-cats", root).innerHTML = [`<button type="button" data-cat=""${cats.length ? "" : ' aria-current="true"'}>All <span>${total}</span></button>`,
        ...d.categories.map((c) => `<button type="button" data-cat="${e(c.value)}"${cats.length === 1 && cats[0] === c.value ? ' aria-current="true"' : ""}>${e(F.typeLabel(c.value))} <span>${c.count}</span></button>`)].join("");
    });
    $("[data-sort]", root).value = d.sort;
    $(".browse-filter-toggle", root).textContent = chips.length ? `Filters (${chips.length})` : "Filters";
    const from = (d.page - 1) * d.per;
    $(".browse-count", root).textContent = d.total ? `${d.total} product${d.total === 1 ? "" : "s"}${d.pages > 1 ? ` · ${from + 1}–${from + d.products.length}` : ""}` : "No products match";
    $(".browse-results-head", root).textContent = narrowed() ? "Results" : "All products";
    grid.innerHTML = d.products.length ? d.products.map((p) => card(p, { level: 3, wish: true, mixed: true })).join("") : empty(chips);
    $(".browse-pages", root).innerHTML = pages(d);
    if (d.ignored && d.ignored.length) $(".browse-count", root).textContent += ` (some filters from this link no longer exist and were left out)`;
    grid.setAttribute("aria-busy", "false");
    dispatchEvent(new CustomEvent("gs:cards"));
    dispatchEvent(new CustomEvent("gs:store-view", { detail: { narrowed: narrowed() } }));
  }

  // No results: say which filters to loosen instead of leaving a dead end.
  function empty(chips) {
    return `<div class="empty browse-empty"><p><strong>Nothing matches all of that.</strong> Try removing one filter:</p>
      <div class="browse-relax">${F.chipsHTML(chips)}</div>
      <button type="button" class="btn ghost" data-clear-all>Clear all filters</button></div>`;
  }

  function pages(d) {
    if (d.pages <= 1) return "";
    const nums = [...new Set([1, d.page - 1, d.page, d.page + 1, d.pages])].filter((n) => n >= 1 && n <= d.pages).sort((a, b) => a - b);
    const btn = (n, text, extra = "") => `<button type="button" data-page="${n}"${extra}>${text}</button>`;
    const out = [];
    if (d.page > 1) out.push(btn(d.page - 1, "← Previous"));
    nums.forEach((n, i) => {
      if (i && n - nums[i - 1] > 1) out.push(`<span aria-hidden="true">…</span>`);
      out.push(btn(n, n, n === d.page ? ' aria-current="page"' : ` aria-label="Page ${n}"`));
    });
    if (d.page < d.pages) out.push(btn(d.page + 1, "Next →"));
    return out.join("");
  }

  // Offline (or the store API failing): the empty state; every product lives in the store.
  function offline() {
    grid.innerHTML = `<p class="empty">Nothing here yet.</p>`;
    $(".browse-count", root).textContent = "The store is offline right now; please try again soon.";
    $("[data-panel]", root).innerHTML = "";
    dispatchEvent(new CustomEvent("gs:cards"));
    dispatchEvent(new CustomEvent("gs:store-view", { detail: { narrowed: false, offline: true } }));
  }

  async function load() {
    const mine = ++seq;
    input.value = params.get("q") || "";
    grid.setAttribute("aria-busy", "true");
    const res = await api(`/api/store/search?${params}`);
    if (mine !== seq) return; // a newer request is on its way
    if (res.ok) return render(res.data);
    if (res.status === 400 && params.toString()) {
      $(".browse-count", root).textContent = `${res.error.message} Showing everything instead.`;
      params = new URLSearchParams();
      return go({ push: false });
    }
    offline();
  }

  // ---------- changes ----------
  const taste = (detail) => document.dispatchEvent(new CustomEvent("gs:taste", { detail }));
  root.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const form = ev.target;
    if (form.matches("[data-search-form]")) {
      const q = input.value.trim();
      q ? params.set("q", q) : params.delete("q");
      if (q) taste({ t: "search", q });
      return go();
    }
    const range = form.dataset.range;
    if (range) {
      if (!form.checkValidity()) return form.reportValidity();
      const [min, max] = [form.min.value.trim(), form.max.value.trim()];
      const k = range === "price" ? "price" : "bpm";
      min ? params.set(`${k}_min`, min) : params.delete(`${k}_min`);
      max ? params.set(`${k}_max`, max) : params.delete(`${k}_max`);
      go();
    }
  });

  root.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.matches("[data-sort]")) { t.value === "relevance" ? params.delete("sort") : params.set("sort", t.value); return go(); }
    if (t.matches("[data-f]")) {
      const key = t.dataset.f, v = t.dataset.v;
      const list = listOf(key);
      setList(key, t.checked ? [...list, v] : list.filter((x) => x !== v));
      if (t.checked && key !== "creator") taste({ t: "filter", facet: key, value: v });
      return go();
    }
    if (t.matches("[data-rating]")) { t.checked ? params.set("rating_min", "4") : params.delete("rating_min"); return go(); }
    if (t.matches("[data-flag]")) { t.checked ? params.set(t.dataset.flag, "1") : params.delete(t.dataset.flag); return go(); }
    if (t.matches("[data-free]")) { t.dataset.free ? params.set("free", t.dataset.free) : params.delete("free"); return go(); }
  });

  root.addEventListener("click", (ev) => {
    const t = ev.target;
    const cat = t.closest("button[data-cat]");
    if (cat) {
      cat.dataset.cat ? params.set("category", cat.dataset.cat) : params.delete("category");
      if (cat.dataset.cat) taste({ t: "filter", facet: "category", value: cat.dataset.cat });
      return go();
    }
    const chip = t.closest("button[data-chip]");
    if (chip) {
      const key = chip.dataset.chip;
      const rest = listOf(key).filter((x) => x !== chip.dataset.chipValue);
      if (rest.length && !["q", "price_min", "price_max", "bpm_min", "bpm_max", "free", "sale", "new", "rating_min"].includes(key)) setList(key, rest);
      else params.delete(key);
      go();
      return $(".browse-results-head", root).focus({ preventScroll: true });
    }
    if (t.closest("button[data-clear-all]")) {
      const sort = params.get("sort");
      params = new URLSearchParams(sort ? { sort } : {});
      go();
      return input.focus();
    }
    const page = t.closest("button[data-page]");
    if (page) {
      params.set("page", page.dataset.page);
      go({ keepPage: true });
      $(".browse-results-head", root).scrollIntoView({ block: "start", behavior: reduce.matches ? "auto" : "smooth" });
      return $(".browse-results-head", root).focus({ preventScroll: true });
    }
    const more = t.closest("button[data-more]");
    if (more) {
      const list = more.previousElementSibling;
      const open = more.getAttribute("aria-expanded") !== "true";
      list.classList.toggle("f-all", open);
      more.setAttribute("aria-expanded", String(open));
      more.textContent = open ? "Show fewer" : `Show all ${list.children.length}`;
      return;
    }
    if (t.closest("button[data-open-filters]")) return drawer(true);
    if (t.closest("[data-close-filters]")) return drawer(false);
  });

  // ---------- the filter drawer on phones ----------
  const aside = $("#browse-filters", root), scrim = $(".browse-scrim", root), toggle = $("[data-open-filters]", root);
  function drawer(open) {
    root.classList.toggle("filters-open", open);
    scrim.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) aside.focus();
    else toggle.focus();
  }
  root.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && root.classList.contains("filters-open")) drawer(false); });

  addEventListener("popstate", () => { params = fromAddress(); load(); });
  // Coming back with the browser's Back button after opening a product: the page may come from the back/forward cache.
  addEventListener("pageshow", (ev) => { if (ev.persisted && last) dispatchEvent(new CustomEvent("gs:cards")); });
  // Autocomplete (js/store-suggest.js) picked a tag or a search.
  root.addEventListener("gs:suggest", (ev) => {
    const d = ev.detail || {};
    if (d.facet) { setList(d.facet, [...new Set([...listOf(d.facet), d.value])]); params.delete("q"); taste({ t: "filter", facet: d.facet, value: d.value }); }
    else if (d.creator) { params.set("creator", d.creator); params.delete("q"); }
    else if (d.q) { params.set("q", d.q); taste({ t: "search", q: d.q }); }
    go();
  });
  load();
})();

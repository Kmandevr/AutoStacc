// The /discover/explore browser (New & upcoming, Discover's tab; /explore redirects here) ([data-explore]): releases and upcoming events from every project on AutoStacc, with search,
// filters (project, type, year, city, month), removable chips and pages; the events view links to the /events calendar.
// Real data only (published content from the content API through js/project-content.js). The address holds the state
// (/discover/explore?view=events&q=&project=&type=&year=&city=&month=&page=; the old view=shows opens events). Searches and
// filters feed the on-device history (gs:taste) like the store's. Needs js/util.js, js/project-content.js,
// js/explore-items.js, js/project-events.js (event cards) and data/projects.js; js/skeleton.js for placeholders.
(function () {
  "use strict";

  const GS = window.GS;
  const { $, escapeHTML: e, fmtDate, look } = GS;
  const root = $("[data-explore]");
  if (!root || !GS.exploreItems) return;
  const X = GS.exploreItems, sk = GS.skeleton; // sk: placeholder rows until the content API answers (optional)
  const VIEWS = [["releases", "Releases"], ["events", "Events"]];
  const NOUN = { releases: ["release", "releases"], events: ["event", "events"] };
  const PER = 12;
  let items = null; // filled once the content API answers; until then the list says it is loading
  const count = (v) => (items ? String(items[v].length) : "");
  const taste = (detail) => document.dispatchEvent(new CustomEvent("gs:taste", { detail }));
  let params;
  const read = () => {
    params = new URLSearchParams();
    for (const [k, v] of new URLSearchParams(location.search)) if (v && v.length <= 80) params.set(k, v);
    if (params.get("view") === "shows") params.set("view", "events");
    if (!VIEWS.some(([v]) => v === params.get("view"))) params.delete("view");
  };
  const view = () => params.get("view") || "releases";
  const listOf = (k) => (params.get(k) || "").split(",").filter(Boolean);
  const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-");

  root.innerHTML = `
    <div class="explore-views" role="tablist" aria-label="What to explore">${VIEWS.map(([v, t]) => `<button type="button" role="tab" id="ex-tab-${v}" data-view="${v}" aria-controls="ex-results">${t} <span data-count="${v}">${count(v)}</span></button>`).join("")}</div>
    <form class="browse-search" role="search" data-search-form>
      <label for="ex-q" class="sr-only">Search</label>
      <input id="ex-q" name="q" type="search" autocomplete="off" enterkeyhint="search" maxlength="80">
      <button class="btn" type="submit">Search</button>
    </form>
    <div class="browse-layout">
      <div class="browse-scrim" data-close-filters hidden></div>
      <aside class="browse-filters" id="ex-filters" aria-label="Filters" tabindex="-1">
        <div class="browse-filters-head"><p class="browse-filters-title">Filters</p><button type="button" class="btn ghost small" data-close-filters>Done</button></div>
        <div data-panel></div>
      </aside>
      <div class="browse-main" id="ex-results" role="tabpanel">
        <div class="browse-bar">
          <button type="button" class="btn ghost browse-filter-toggle" aria-controls="ex-filters" aria-expanded="false" data-open-filters>Filters</button>
          <p class="browse-count" aria-live="polite"></p>
        </div>
        <p class="ex-calendar" data-calendar hidden>Every event by date and place, with filters for city and host: <a class="btn small" href="/events">Open the events calendar</a></p>
        <div class="browse-chips" data-chips></div>
        <h2 class="browse-results-head" id="ex-head" tabindex="-1"></h2>
        <div class="explore-list" data-list></div>
        <nav class="browse-pages" aria-label="Result pages"></nav>
      </div>
    </div>`;
  const input = $("#ex-q", root), list = $("[data-list]", root);
  if (sk) sk.show(list, "row", 4); else { list.setAttribute("aria-busy", "true"); list.innerHTML = `<p class="small-print">Loading…</p>`; }

  const art = (x) => {
    const src = x.artwork && GS.content ? GS.content.art(x.artwork.src) : "";
    return src ? `<img src="${e(src)}" alt="" width="120" height="120" loading="lazy">` : `<span aria-hidden="true">${e(x.title.charAt(0))}</span>`;
  };
  const row = {
    releases: (x) => `<article class="ex-item ${look(x.project)}"><a class="ex-art" href="${e(x.href)}" tabindex="-1" aria-hidden="true">${art(x)}</a>
      <div><h3><a href="${e(x.href)}">${e(x.title)}</a></h3><p class="ex-meta"><span class="tag">${e(x.type)}</span> ${e(x.projectName)} · <time datetime="${e(x.date)}">${e(fmtDate(x.date))}</time>${x.tracks ? ` · ${x.tracks} track${x.tracks === 1 ? "" : "s"}` : ""}</p>
      ${x.text ? `<p class="ex-text">${e(x.text)}</p>` : ""}</div></article>`,
    events: (x) => `<li>${GS.eventCard(x)}</li>`
  };
  const EMPTY = { releases: "No releases yet.", events: "No events announced right now. Follow a project to hear when dates are confirmed." };

  function render(focusId) {
    if (!items) return;
    const v = view();
    const f = { q: params.get("q") || "" };
    for (const [key] of X.FILTERS[v]) f[key] = listOf(key);
    const { hits, facets } = X.query(v, items[v], f);
    const pages = Math.max(1, Math.ceil(hits.length / PER));
    const page = Math.min(pages, Math.max(1, Number(params.get("page")) || 1));
    root.querySelectorAll("[data-view]").forEach((b) => { const on = b.dataset.view === v; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    $("#ex-results", root).setAttribute("aria-labelledby", `ex-tab-${v}`);
    input.value = f.q;
    input.placeholder = `Search ${v}…`;
    $("[data-panel]", root).innerHTML = `<h2 class="sr-only">Filters</h2>` + facets.filter((g) => g.values.length).map((g) => `<details class="f-group" open><summary>${e(g.title)}</summary><ul class="f-list">
      ${g.values.map((x) => `<li><label for="exf-${e(g.key)}-${slug(x.value)}"><input type="checkbox" id="exf-${e(g.key)}-${slug(x.value)}" data-f="${e(g.key)}" data-v="${e(x.value)}"${x.selected ? " checked" : ""}${!x.count && !x.selected ? " disabled" : ""}>
        <span>${e(x.label)}</span><span class="f-count">${x.count}</span></label></li>`).join("")}</ul></details>`).join("");
    const chips = [...(f.q ? [["q", f.q, `“${f.q}”`]] : []), ...facets.flatMap((g) => g.values.filter((x) => x.selected).map((x) => [g.key, x.value, `${g.title}: ${x.label}`]))]
      .map(([k, val, t]) => `<button type="button" class="chip" data-chip="${e(k)}" data-chip-value="${e(val)}">${e(t)}<span aria-hidden="true"> ×</span><span class="sr-only"> (remove this filter)</span></button>`).join("");
    $("[data-chips]", root).innerHTML = chips ? `${chips}<button type="button" class="chip-clear" data-clear-all>Clear all</button>` : "";
    const name = VIEWS.find(([x]) => x === v)[1];
    $(".browse-count", root).textContent = hits.length ? `${hits.length} ${NOUN[v][hits.length === 1 ? 0 : 1]}` : "";
    $("#ex-head", root).textContent = chips ? `${name}: results` : v === "events" ? "Upcoming events" : `Latest ${name.toLowerCase()}`;
    $("[data-calendar]", root).hidden = v !== "events";
    const shown = hits.slice((page - 1) * PER, page * PER).map(row[v]).join("");
    list.innerHTML = hits.length ? (v === "events" ? `<ul class="ecards">${shown}</ul>` : shown)
      : `<div class="empty browse-empty"><p><strong>${chips ? "Nothing matches all of that." : e(EMPTY[v])}</strong>${chips ? " Try removing a filter:" : ""}</p>${chips ? `<div class="browse-relax">${chips}</div>` : ""}</div>`;
    $(".browse-pages", root).innerHTML = pages > 1 ? Array.from({ length: pages }, (_, i) => i + 1)
      .map((n) => `<button type="button" data-page="${n}"${n === page ? ' aria-current="page"' : ` aria-label="Page ${n}"`}>${n}</button>`).join("") : "";
    const again = focusId && document.getElementById(focusId);
    if (again) again.focus({ preventScroll: true });
  }
  function go(focusId, keepPage = false, replace = false) {
    if (!keepPage) params.delete("page");
    const qs = params.toString();
    history[replace ? "replaceState" : "pushState"](null, "", location.pathname + (qs ? `?${qs}` : ""));
    render(focusId);
  }

  root.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const q = input.value.trim();
    q ? params.set("q", q) : params.delete("q");
    if (q) taste({ t: "search", q });
    go();
  });
  root.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!t.matches("[data-f]")) return;
    const l = listOf(t.dataset.f), next = t.checked ? [...l, t.dataset.v] : l.filter((x) => x !== t.dataset.v);
    next.length ? params.set(t.dataset.f, next.join(",")) : params.delete(t.dataset.f);
    go(t.id);
  });
  root.addEventListener("click", (ev) => {
    const t = ev.target;
    const tab = t.closest("button[data-view]");
    if (tab) return switchTo(tab);
    const chip = t.closest("button[data-chip]");
    if (chip) {
      const rest = listOf(chip.dataset.chip).filter((x) => x !== chip.dataset.chipValue);
      rest.length && chip.dataset.chip !== "q" ? params.set(chip.dataset.chip, rest.join(",")) : params.delete(chip.dataset.chip);
      return go("ex-head");
    }
    if (t.closest("button[data-clear-all]")) { params = new URLSearchParams(params.get("view") ? { view: params.get("view") } : {}); return go("ex-q"); }
    const page = t.closest("button[data-page]");
    if (page) { params.set("page", page.dataset.page); return go("ex-head", true); }
    if (t.closest("button[data-open-filters]")) return drawer(true);
    if (t.closest("[data-close-filters]")) return drawer(false);
  });
  // Another view keeps the search words (its filters differ, so they go). Arrow keys, Home and End move between the
  // tabs without adding a history step for each press.
  function switchTo(tab, replace = false) {
    const q = params.get("q");
    params = new URLSearchParams();
    if (tab.dataset.view !== "releases") params.set("view", tab.dataset.view);
    if (q) params.set("q", q);
    go(tab.id, false, replace);
  }
  $(".explore-views", root).addEventListener("keydown", (ev) => {
    const tabs = [...root.querySelectorAll("[data-view]")], i = tabs.indexOf(document.activeElement);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1 + tabs.length, Home: 0, End: tabs.length - 1 }[ev.key];
    if (i < 0 || to === undefined) return;
    ev.preventDefault();
    switchTo(tabs[to % tabs.length], true);
  });
  const aside = $("#ex-filters", root), scrim = $(".browse-scrim", root), toggle = $("[data-open-filters]", root);
  function drawer(open) {
    root.classList.toggle("filters-open", open);
    scrim.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    (open ? aside : toggle).focus();
  }
  root.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && root.classList.contains("filters-open")) drawer(false); });
  addEventListener("popstate", () => { read(); render(); });
  read();
  X.load().then((got) => {
    items = got;
    root.querySelectorAll("[data-count]").forEach((c) => { c.textContent = count(c.dataset.count); });
    if (sk) sk.done(list); else list.removeAttribute("aria-busy");
    render();
  });
})();

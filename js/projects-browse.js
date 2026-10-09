// The projects browser ([data-projects-browse] on /projects): every project on AutoStacc, AutoStacc's own and creators'
// from the Studio, to explore and follow. Nothing is bought here; a project links to its items in the store. Search,
// "what they make", genre and style, recently active and (signed in) followed or not, with counts, removable chips,
// sort and pages, all answered by GET /api/projects/browse. The address holds the state (/projects?q=&makes=&genre=
// &style=&active=1&followed=1&sort=&page=). Offline, the page keeps its built list of AutoStacc's projects.
// Needs js/util.js, js/project-card.js and data/product-types.js; js/follow.js fills the follow controls.
(function () {
  "use strict";

  const GS = window.GS;
  const { $, escapeHTML: e, api } = GS;
  const root = $("[data-projects-browse]");
  if (!root || !GS.projectCard) return;
  const card = GS.projectCard;
  const KEYS = ["q", "makes", "genre", "style", "active", "followed", "sort", "page"];
  const SORTS = [["active", "Recently active"], ["name", "Name"], ["newest", "Newest on AutoStacc"], ["items", "Most store items"]];
  const fromAddress = () => {
    const p = new URLSearchParams();
    for (const [k, v] of new URLSearchParams(location.search)) if (KEYS.includes(k) && v && (k !== "page" || /^\d{1,3}$/.test(v))) p.set(k, v);
    return p;
  };
  let params = fromAddress(), seq = 0;
  const fallback = root.innerHTML; // the built list, shown again if the store is offline
  const listOf = (k) => (params.get(k) || "").split(",").filter(Boolean);
  const setList = (k, l) => (l.length ? params.set(k, l.join(",")) : params.delete(k));
  const taste = (detail) => document.dispatchEvent(new CustomEvent("gs:taste", { detail }));

  root.innerHTML = `
    <form class="browse-search" role="search" data-search-form>
      <label for="projects-q" class="sr-only">Search projects</label>
      <input id="projects-q" name="q" type="search" placeholder="Search projects, creators, genres…" autocomplete="off" enterkeyhint="search" maxlength="80">
      <button class="btn" type="submit">Search</button>
    </form>
    <nav class="browse-cats" aria-label="What they make"></nav>
    <div class="browse-layout">
      <div class="browse-scrim" data-close-filters hidden></div>
      <aside class="browse-filters" id="projects-filters" aria-label="Filters" tabindex="-1">
        <div class="browse-filters-head"><p class="browse-filters-title">Filters</p><button type="button" class="btn ghost small" data-close-filters>Done</button></div>
        <div data-panel></div>
      </aside>
      <div class="browse-main">
        <div class="browse-bar">
          <button type="button" class="btn ghost browse-filter-toggle" aria-controls="projects-filters" aria-expanded="false" data-open-filters>Filters</button>
          <p class="browse-count" aria-live="polite"></p>
          <label class="browse-sort" for="projects-sort">Sort <select id="projects-sort" data-sort>${SORTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>
        </div>
        <div class="browse-chips" data-chips></div>
        <h2 class="browse-results-head" id="projects-head" tabindex="-1">All projects</h2>
        <div class="pgrid" aria-labelledby="projects-head" aria-busy="false"></div>
        <nav class="browse-pages" aria-label="Result pages"></nav>
      </div>
    </div>`;
  const grid = $(".pgrid", root), input = $("#projects-q", root);

  const box = (group, value, text, count, checked) => `<li><label for="pf-${e(group)}-${e(value)}"><input type="checkbox" id="pf-${e(group)}-${e(value)}" data-f="${e(group)}" data-v="${e(value)}"${checked ? " checked" : ""}${!count && !checked ? " disabled" : ""}>
    <span>${e(text)}</span><span class="f-count">${count}</span></label></li>`;
  const group = (id, title, items) => (items.length ? `<details class="f-group" open><summary>${e(title)}</summary><ul class="f-list">${items.map((x) => box(id, x.value, x.label, x.count, x.selected)).join("")}</ul></details>` : "");

  function panel(d) {
    const followed = params.get("followed");
    return `<h2 class="sr-only">Filters</h2>
      <details class="f-group" open><summary>Activity</summary><ul class="f-list">
        <li><label for="pf-active"><input type="checkbox" id="pf-active" data-flag="active"${params.get("active") === "1" ? " checked" : ""}>
          <span>Recently active</span><span class="f-count">${d.toggles.active}</span></label></li></ul>
        <p class="f-hint small-print">New in the last 30 days, or a show coming up.</p></details>
      ${d.canFollow ? `<details class="f-group" open><summary>Following</summary><ul class="f-list">
        ${[["", "All projects"], ["1", "Ones I follow"], ["0", "Ones I don't follow yet"]].map(([v, t]) => `<li><label for="pf-fol-${v || "all"}"><input type="radio" name="followed" id="pf-fol-${v || "all"}" data-followed="${v}"${(followed || "") === v ? " checked" : ""}> <span>${t}</span></label></li>`).join("")}
      </ul></details>` : ""}
      ${group("genre", "Genre", d.facets.genre)}${group("style", "Style", d.facets.style)}`;
  }

  function chips(d) {
    const out = [];
    const lab = (facet, v) => ((d.facets[facet] || []).find((x) => x.value === v) || {}).label || v;
    if (params.get("q")) out.push(["q", params.get("q"), `“${params.get("q")}”`]);
    listOf("makes").forEach((v) => out.push(["makes", v, card.makesLabel(v)]));
    listOf("genre").forEach((v) => out.push(["genre", v, `Genre: ${lab("genre", v)}`]));
    listOf("style").forEach((v) => out.push(["style", v, `Style: ${lab("style", v)}`]));
    if (params.get("active") === "1") out.push(["active", "1", "Recently active"]);
    if (params.get("followed")) out.push(["followed", params.get("followed"), params.get("followed") === "1" ? "Following" : "Not followed yet"]);
    return out.map(([k, v, t]) => `<button type="button" class="chip" data-chip="${e(k)}" data-chip-value="${e(v)}">${e(t)}<span aria-hidden="true"> ×</span><span class="sr-only"> (remove this filter)</span></button>`).join("");
  }

  function render(d) {
    const id = document.activeElement && document.activeElement.id;
    const makes = listOf("makes");
    $(".browse-cats", root).innerHTML = [`<button type="button" data-makes=""${makes.length ? "" : ' aria-current="true"'}>Everything</button>`,
      ...d.facets.makes.map((m) => `<button type="button" data-makes="${e(m.value)}"${makes.length === 1 && makes[0] === m.value ? ' aria-current="true"' : ""}>${e(card.makesLabel(m.value))} <span>${m.count}</span></button>`)].join("");
    $("[data-panel]", root).innerHTML = panel(d);
    const c = chips(d);
    $("[data-chips]", root).innerHTML = c ? `${c}<button type="button" class="chip-clear" data-clear-all>Clear all</button>` : "";
    $("[data-sort]", root).value = d.sort;
    $(".browse-count", root).textContent = d.total ? `${d.total} project${d.total === 1 ? "" : "s"}` : "No projects match";
    $("#projects-head", root).textContent = c ? "Results" : "All projects";
    grid.innerHTML = d.projects.length ? d.projects.map((p) => card(p)).join("")
      : `<div class="empty browse-empty"><p><strong>No project matches all of that.</strong> Try removing one filter:</p><div class="browse-relax">${c}</div>
        <button type="button" class="btn ghost" data-clear-all>Clear all filters</button></div>`;
    $(".browse-pages", root).innerHTML = d.pages > 1 ? Array.from({ length: d.pages }, (_, i) => i + 1)
      .map((n) => `<button type="button" data-page="${n}"${n === d.page ? ' aria-current="page"' : ` aria-label="Page ${n}"`}>${n}</button>`).join("") : "";
    grid.setAttribute("aria-busy", "false");
    const again = id && document.getElementById(id);
    if (again && again !== document.activeElement) again.focus({ preventScroll: true });
    dispatchEvent(new CustomEvent("gs:projects"));
  }

  async function load() {
    const mine = ++seq;
    input.value = params.get("q") || "";
    grid.setAttribute("aria-busy", "true");
    const res = await api(`/api/projects/browse?${params}`);
    if (mine !== seq) return;
    if (res.ok) return render(res.data);
    if (res.status === 400 && params.toString()) { params = new URLSearchParams(); return go(false); }
    grid.innerHTML = fallback;
    $(".browse-count", root).textContent = "Search and filters are offline right now; here are AutoStacc's own projects.";
  }
  function go(push = true, keepPage = false) {
    if (!keepPage) params.delete("page");
    const qs = params.toString();
    history[push ? "pushState" : "replaceState"](null, "", location.pathname + (qs ? `?${qs}` : ""));
    load();
  }

  root.addEventListener("submit", (ev) => {
    if (!ev.target.matches("[data-search-form]")) return;
    ev.preventDefault();
    const q = input.value.trim();
    q ? params.set("q", q) : params.delete("q");
    if (q) taste({ t: "search", q });
    go();
  });
  root.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.matches("[data-sort]")) { t.value === "active" ? params.delete("sort") : params.set("sort", t.value); return go(); }
    if (t.matches("[data-f]")) {
      const l = listOf(t.dataset.f);
      setList(t.dataset.f, t.checked ? [...l, t.dataset.v] : l.filter((x) => x !== t.dataset.v));
      if (t.checked) taste({ t: "filter", facet: t.dataset.f, value: t.dataset.v });
      return go();
    }
    if (t.matches("[data-flag]")) { t.checked ? params.set(t.dataset.flag, "1") : params.delete(t.dataset.flag); return go(); }
    if (t.matches("[data-followed]")) { t.dataset.followed ? params.set("followed", t.dataset.followed) : params.delete("followed"); return go(); }
  });
  root.addEventListener("click", (ev) => {
    const t = ev.target;
    const m = t.closest("button[data-makes]");
    if (m) { m.dataset.makes ? params.set("makes", m.dataset.makes) : params.delete("makes"); return go(); }
    const chip = t.closest("button[data-chip]");
    if (chip) {
      const rest = listOf(chip.dataset.chip).filter((x) => x !== chip.dataset.chipValue);
      if (rest.length && ["makes", "genre", "style"].includes(chip.dataset.chip)) setList(chip.dataset.chip, rest); else params.delete(chip.dataset.chip);
      go();
      return $("#projects-head", root).focus({ preventScroll: true });
    }
    if (t.closest("button[data-clear-all]")) { params = new URLSearchParams(params.get("sort") ? { sort: params.get("sort") } : {}); go(); return input.focus(); }
    const page = t.closest("button[data-page]");
    if (page) { params.set("page", page.dataset.page); go(true, true); return $("#projects-head", root).focus(); }
    if (t.closest("button[data-open-filters]")) return drawer(true);
    if (t.closest("[data-close-filters]")) return drawer(false);
  });
  const aside = $("#projects-filters", root), scrim = $(".browse-scrim", root), toggle = $("[data-open-filters]", root);
  function drawer(open) {
    root.classList.toggle("filters-open", open);
    scrim.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    (open ? aside : toggle).focus();
  }
  root.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && root.classList.contains("filters-open")) drawer(false); });
  addEventListener("popstate", () => { params = fromAddress(); load(); });
  load();
})();

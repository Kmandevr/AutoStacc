// The creators browser ([data-creators-browse] on /creators): every creator on AutoStacc, AutoStacc's own and Studio
// creators', with their projects and a link to /<creator>. Search and sort with pages, answered by GET /api/creators;
// the address holds the state (/creators?q=&sort=&page=). A short bio shows from the Studio (and for AutoStacc's own creators from their
// summary in data/creators.js). Placeholders while loading (GS.skeleton); offline, the page keeps its built list.
// Needs js/util.js; js/skeleton.js is optional.
(function () {
  "use strict";

  const GS = window.GS;
  const { $, escapeHTML: e, api } = GS;
  const root = $("[data-creators-browse]");
  if (!root) return;
  const sk = GS.skeleton;
  const KEYS = ["q", "sort", "page"];
  const SORTS = [["name", "Name"], ["newest", "Newest on AutoStacc"], ["projects", "Most projects"]];
  const BIO = new Map((window.CREATORS || []).filter((c) => c.summary).map((c) => [c.id, c.summary]));
  const fromAddress = () => {
    const p = new URLSearchParams();
    for (const [k, v] of new URLSearchParams(location.search)) if (KEYS.includes(k) && v && (k !== "page" || /^\d{1,3}$/.test(v))) p.set(k, v);
    return p;
  };
  let params = fromAddress(), seq = 0;
  const fallback = ($("[data-creator-list]", root) || {}).innerHTML || ""; // the built list, shown again if the store is offline

  root.innerHTML = `
    <form class="browse-search" role="search" data-search-form>
      <label for="creators-q" class="sr-only">Search creators</label>
      <input id="creators-q" name="q" type="search" placeholder="Search creators and their projects…" autocomplete="off" enterkeyhint="search" maxlength="80">
      <button class="btn" type="submit">Search</button>
    </form>
    <div class="browse-bar">
      <p class="browse-count" aria-live="polite"></p>
      <label class="browse-sort" for="creators-sort">Sort <select id="creators-sort" data-sort>${SORTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>
    </div>
    <h2 class="browse-results-head" id="creators-head" tabindex="-1">All creators</h2>
    <ul class="cgrid" aria-labelledby="creators-head" aria-busy="false"></ul>
    <nav class="browse-pages" aria-label="Result pages"></nav>`;
  const grid = $(".cgrid", root), input = $("#creators-q", root);

  const initial = (name) => (name.match(/[\p{L}\p{N}]/u) || ["?"])[0].toUpperCase();
  function card(c) {
    const bio = c.firstParty ? BIO.get(c.slug) || c.bio : c.bio;
    return `<li class="ccard">
      <a class="ccard-avatar" href="${e(c.path)}" tabindex="-1" aria-hidden="true"><span>${e(initial(c.name))}</span></a>
      <div class="ccard-body">
        <h3 class="ccard-name"><a href="${e(c.path)}">${e(c.name)}</a></h3>
        ${c.verified ? "" : `<p class="ccard-by"><span class="tag unverified" title="AutoStacc hasn't verified this creator">Unverified creator</span></p>`}
        ${bio ? `<p class="ccard-bio">${e(bio)}</p>` : ""}
        <ul class="ccard-projects" aria-label="Projects by ${e(c.name)}">${c.projects.map((p) => `<li><a href="${e(p.path)}">${e(p.name)}</a></li>`).join("")}</ul>
        <p class="ccard-actions"><a class="btn small" href="${e(c.path)}">Visit<span class="sr-only"> ${e(c.name)}</span></a></p>
      </div>
    </li>`;
  }

  function render(d) {
    const q = params.get("q");
    $("[data-sort]", root).value = d.sort;
    $(".browse-count", root).textContent = d.total ? `${d.total} creator${d.total === 1 ? "" : "s"}` : "No creators match";
    $("#creators-head", root).textContent = q ? "Results" : "All creators";
    if (sk) sk.done(grid);
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = d.creators.length ? d.creators.map(card).join("")
      : `<li class="empty browse-empty"><p><strong>No creator matches “${e(q || "")}”.</strong></p><button type="button" class="btn ghost" data-clear>Show every creator</button></li>`;
    $(".browse-pages", root).innerHTML = d.pages > 1 ? Array.from({ length: d.pages }, (_, i) => i + 1)
      .map((n) => `<button type="button" data-page="${n}"${n === d.page ? ' aria-current="page"' : ` aria-label="Page ${n}"`}>${n}</button>`).join("") : "";
  }

  async function load() {
    const mine = ++seq;
    input.value = params.get("q") || "";
    if (sk) sk.show(grid, "row", 6); else grid.setAttribute("aria-busy", "true");
    const res = await api(`/api/creators?${params}`);
    if (mine !== seq) return;
    if (res.ok) return render(res.data);
    if (res.status === 400 && params.toString()) { params = new URLSearchParams(); return go(false); }
    if (sk) sk.done(grid);
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = fallback;
    $(".browse-count", root).textContent = "Search is offline right now; here are AutoStacc's own creators.";
    $(".browse-pages", root).innerHTML = "";
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
    go();
  });
  root.addEventListener("change", (ev) => {
    if (!ev.target.matches("[data-sort]")) return;
    ev.target.value === "name" ? params.delete("sort") : params.set("sort", ev.target.value);
    go();
  });
  root.addEventListener("click", (ev) => {
    if (ev.target.closest("button[data-clear]")) { params.delete("q"); go(); return input.focus(); }
    const page = ev.target.closest("button[data-page]");
    if (page) { params.set("page", page.dataset.page); go(true, true); $("#creators-head", root).focus(); }
  });
  addEventListener("popstate", () => { params = fromAddress(); load(); });
  load();
})();

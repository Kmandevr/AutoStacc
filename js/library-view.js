// Your Stacc's HTML templates (docs/library.md): the view switch and filters, the project → Stacclet → Pac tree, the
// content-type view, asset rows with checkboxes, and the "from projects you follow" list. Pure string builders over
// GS.stacc output; js/library.js owns state, events and downloads. Sets GS.libraryView. Needs js/util.js.
(function () {
  "use strict";

  const { escapeHTML: e, cents } = window.GS;
  const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
  const items = (n) => `${n} item${n === 1 ? "" : "s"}`;
  const SOURCES = { purchase: "bought", free: "free", auto: "auto-stacc'd", promo: "promo", manual: "gift", bundle: "bundle", subscription: "subscription", replacement: "replacement" };

  // ctx: { catalog, selected: Set of asset ids, names: { project(id), stacclet(id), pac(id) } }
  function asset(a, ctx, showSource) {
    const where = a.pacId ? `${ctx.names.stacclet(a.staccletId)} › ${ctx.names.pac(a.pacId)}` : a.productTitle;
    const source = showSource ? `${e(ctx.names.project(a.projectId))} › ${e(where)} · ` : a.pacId ? `${e(a.productTitle)} · ` : "";
    return `<li class="stacc-asset">
      <label class="stacc-pick"><input type="checkbox" data-select="${e(a.id)}"${ctx.selected.has(a.id) ? " checked" : ""}>
        <span class="stacc-name">${e(a.name)}<span class="small-print"> ${source}${e(a.format.toUpperCase() || "file")} · ${size(a.sizeBytes)}${a.sources.includes("auto") ? " · auto-stacc'd" : ""}</span></span></label>
      <button class="btn ghost" type="button" data-download="${e(a.id)}" data-product="${e(a.productId)}">Download</button>
    </li>`;
  }

  // A labelled group of assets with a "select all" box for exactly those assets.
  function group(title, list, ctx, { showSource = false, level = 3 } = {}) {
    const ids = list.map((a) => a.id);
    const all = ids.every((id) => ctx.selected.has(id));
    return `<div class="stacc-group">
      <div class="stacc-group-head"><h${level}>${e(title)} <span class="stacc-count">${list.length}</span></h${level}>
        <label class="stacc-all"><input type="checkbox" data-select-group="${e(ids.join(" "))}"${all ? " checked" : ""}> Select all</label></div>
      <ul class="stacc-assets">${list.map((a) => asset(a, ctx, showSource)).join("")}</ul>
    </div>`;
  }

  const kinds = (list, ctx) => list.map((k) => group(k.label, k.assets, ctx, { level: 4 })).join("");

  function treeView(tree, ctx) {
    return tree.map((p) => `<section class="stacc-project">
      <h2>${e(p.name)} <span class="stacc-count">${items(p.count)}</span></h2>
      ${p.stacclets.map((s) => `<details class="stacc-stacclet" open><summary><span class="stacc-kind">Stacclet</span> ${e(s.title)} <span class="stacc-count">${items(s.count)}</span></summary>
        ${s.pacs.map((pac) => `<details class="stacc-pac" open><summary><span class="stacc-kind">Pac</span> ${e(pac.title)} <span class="stacc-count">${items(pac.count)}</span></summary>${kinds(pac.kinds, ctx)}</details>`).join("")}
      </details>`).join("")}
      ${p.products.map((x) => `<details class="stacc-stacclet" open><summary>${e(x.title)} <span class="stacc-count">${items(x.count)}</span></summary>${kinds(x.kinds, ctx)}</details>`).join("")}
    </section>`).join("");
  }

  const kindView = (groups, ctx) => groups.map((g) => group(g.label, g.assets, ctx, { showSource: true, level: 2 })).join("");

  function select(name, label, options, value) {
    return `<label class="stacc-filter">${label}<select data-filter="${name}"><option value="">All</option>${options.map(([v, text]) =>
      `<option value="${e(v)}"${v === value ? " selected" : ""}>${e(text)}</option>`).join("")}</select></label>`;
  }

  // facets: GS.stacc.facets(assets); state: { view, filter }.
  function toolbar(facets, state, ctx) {
    const types = ctx.catalog.contentTypes || {};
    return `<div class="stacc-bar">
      <div class="stacc-views" role="group" aria-label="Organize by">
        <button type="button" class="btn ghost" data-view="projects" aria-pressed="${state.view === "projects"}">By project</button>
        <button type="button" class="btn ghost" data-view="kinds" aria-pressed="${state.view === "kinds"}">By content type</button>
      </div>
      ${facets.projects.length > 1 ? select("project", "Project", facets.projects.map(([id, n]) => [id, `${ctx.names.project(id)} (${n})`]), state.filter.project) : ""}
      ${select("kind", "Type", facets.kinds.map(([k, n]) => [k, `${(types[k] || {}).label || k} (${n})`]), state.filter.kind)}
      ${select("format", "Format", facets.formats.map(([f, n]) => [f, `${f.toUpperCase()} (${n})`]), state.filter.format)}
    </div>`;
  }

  function selection(count) {
    return `<div class="stacc-selection" role="status">${count ? `${items(count)} selected
      <button class="btn" type="button" data-download-selected>Download selected</button>
      <button class="link-btn" type="button" data-clear-selection>Clear</button>` : "Tick files to download several at once."}</div>`;
  }

  // Owned products with no files yet.
  const waiting = (list) => list.length ? `<div class="panel stacc-waiting"><h2>On the way</h2><p>Files for these are being prepared; they'll land here by themselves.</p>
    <ul>${list.map((it) => `<li><a href="${e(it.path || `/shop/${it.productId}`)}">${e(it.title)}</a> <span class="small-print">${it.sources.map((s) => e(SOURCES[s] || s)).join(", ")}</span></li>`).join("")}</ul></div>` : "";

  // Published products of followed projects that aren't in the Stacc yet. Never implies ownership.
  function following(follows, products, ctx) {
    if (!follows) return "";
    if (!follows.length) return `<p class="small-print stacc-follow-hint">Follow <a href="/projects">projects</a> to see their new releases here, and switch on Auto-Stacc to add their free ones automatically.</p>`;
    if (!products.length) return "";
    return `<section class="stacc-new"><h2>New from projects you follow</h2><ul class="tiles">${products.map((p) =>
      `<li><a class="tile" href="${e(p.path || `/shop/${p.id}`)}"><span class="tag">${e(ctx.names.project(p.projectId))}</span><strong>${e(p.title)}</strong><span class="price">${p.free ? "Free" : cents(p.priceCents, p.currency)}</span></a></li>`).join("")}</ul></section>`;
  }

  window.GS.libraryView = { toolbar, treeView, kindView, selection, waiting, following };
})();

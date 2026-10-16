// Your Stacc's HTML templates (docs/library.md): the view switch and filters, the project → Stacclet → Pac tree (with
// each Pac's previews, read me and nested folders), the
// content-type view, asset rows with checkboxes, and the "from projects you follow" list. Pure string builders over
// GS.stacc output; js/library.js owns state, events and downloads. Sets GS.libraryView. Needs js/util.js.
(function () {
  "use strict";

  const { escapeHTML: e, cents, fmtDate } = window.GS;
  // A pack its creator updated: some of its files are going (each says until when).
  const UPDATED = `<span class="tag" title="Some files were removed or replaced in an update. Download them before the date shown.">Updated</span>`;
  const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
  const items = (n) => `${n} item${n === 1 ? "" : "s"}`;
  const files = (n) => `${n} file${n === 1 ? "" : "s"}`;
  const SOURCES = { purchase: "bought", free: "free", auto: "added by Auto-Stacc", promo: "promo", manual: "gift", bundle: "bundle", subscription: "subscription", replacement: "replacement" };

  // ctx: { catalog, selected: Set of asset ids, names: { project(id), stacclet(id), pac(id) } }, and optional hooks for a
  // person's own organization (js/library-personal.js): filters(facets), tools(count), chips(asset).
  function asset(a, ctx, showSource) {
    const where = a.pacId ? `${ctx.names.stacclet(a.staccletId)} › ${ctx.names.pac(a.pacId)}` : a.productTitle;
    const source = showSource ? `${e(ctx.names.project(a.projectId))} › ${e(where)} · ` : a.pacId ? `${e(a.productTitle)} · ` : "";
    return `<li class="stacc-asset">
      <label class="stacc-pick"><input type="checkbox" data-select="${e(a.id)}"${ctx.selected.has(a.id) ? " checked" : ""}>
        <span class="stacc-name">${e(a.name)}<span class="small-print"> ${source}${e(a.format.toUpperCase() || "file")} · ${size(a.sizeBytes)}${a.sources.includes("auto") ? " · added by Auto-Stacc (you follow this project)" : ""}${a.availableUntil ? ` · <strong>removed in an update; yours to download until ${e(fmtDate(a.availableUntil.slice(0, 10)))}</strong>` : ""}</span></span></label>
      ${ctx.chips ? ctx.chips(a) : ""}
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

  // A creator's folders (GS.stacc foldersOf): folders inside folders, each a <details> with its own files, and "Select
  // all" and one ZIP (the bundleable files in it and below, up to the store's 2,000) for everything inside.
  const BUNDLE_MAX = 2000;
  const within = (n) => [...n.assets, ...n.folders.flatMap(within)];
  function folderTools(n, ctx, label) {
    const list = within(n), ids = list.map((a) => a.id);
    const zip = list.filter((a) => a.bundleable).map((a) => a.id);
    // .stacc-group-head: js/library-bundle.js puts a failed ZIP's message there.
    return `<div class="stacc-group-head stacc-folder-tools">
        <label class="stacc-all"><input type="checkbox" data-select-group="${e(ids.join(" "))}"${ids.every((id) => ctx.selected.has(id)) ? " checked" : ""}> Select all</label>
        ${zip.length > 1 && zip.length <= BUNDLE_MAX ? `<button class="btn ghost" type="button" data-bundle="${e(zip.join(" "))}">${label}</button>` : ""}</div>`;
  }
  const folderBody = (n, ctx, depth) => `${n.assets.length ? `<ul class="stacc-assets">${n.assets.map((a) => asset(a, ctx, false)).join("")}</ul>` : ""}
      ${n.folders.map((f) => folder(f, ctx, depth + 1)).join("")}`;
  // Open near the top, or when small enough to read at a glance; deeper, bigger folders start folded.
  const folder = (n, ctx, depth) => `<details class="stacc-folder"${depth === 0 || n.count <= 20 ? " open" : ""}>
      <summary><span class="stacc-folder-name">${e(n.name)}</span> <span class="stacc-count">${files(n.count)}</span></summary>
      <div class="stacc-folder-body">${folderTools(n, ctx, "Download folder (ZIP)")}${folderBody(n, ctx, depth)}</div>
    </details>`;
  const folders = (root, ctx) => `<div class="stacc-folders">${folderTools(root, ctx, "Download all (ZIP)")}${folderBody(root, ctx, -1)}</div>`;

  // A Pac's or product's preview clips (public, at most 3 per Pac) and its read me, folded, as plain text.
  function extras(x) {
    const clips = (x.previews || []).filter((c) => c && /^\/media\//.test(c.url));
    if (!clips.length && !x.readme) return "";
    return `<div class="stacc-extras">
      ${clips.length ? `<ul class="pac-previews">${clips.map((c) => `<li><span class="pac-preview-title">${e(c.title)}</span>
        <audio controls preload="none" src="${e(c.url)}" aria-label="${e(`Preview: ${c.title}`)}"></audio></li>`).join("")}</ul>` : ""}
      ${x.readme ? `<details class="pac-readme"><summary>Read me</summary><pre>${e(x.readme)}</pre></details>` : ""}
    </div>`;
  }
  const contents = (x, ctx) => extras(x) + (x.folders ? folders(x.folders, ctx) : kinds(x.kinds, ctx));

  function treeView(tree, ctx) {
    return tree.map((p) => `<section class="stacc-project">
      <h2>${e(p.name)} <span class="stacc-count">${items(p.count)}</span></h2>
      ${p.stacclets.map((s) => `<details class="stacc-stacclet" open><summary><span class="stacc-kind">Stacclet</span> ${e(s.title)} <span class="stacc-count">${items(s.count)}</span></summary>
        ${s.pacs.map((pac) => `<details class="stacc-pac" open><summary><span class="stacc-kind">Pac</span> ${e(pac.title)} <span class="stacc-count">${items(pac.count)}</span>${pac.updated ? ` ${UPDATED}` : ""}</summary>${contents(pac, ctx)}</details>`).join("")}
      </details>`).join("")}
      ${p.products.map((x) => `<details class="stacc-stacclet" open><summary>${e(x.title)} <span class="stacc-count">${items(x.count)}</span>${x.updated ? ` ${UPDATED}` : ""}</summary>${contents(x, ctx)}</details>`).join("")}
    </section>`).join("");
  }

  const kindView = (groups, ctx) => groups.map((g) => group(g.label, g.assets, ctx, { showSource: true, level: 2 })).join("");

  function select(name, label, options, value) {
    return `<label class="stacc-filter">${label}<select data-filter="${name}"><option value="">All</option>${options.map(([v, text]) =>
      `<option value="${e(v)}"${v === value ? " selected" : ""}>${e(text)}</option>`).join("")}</select></label>`;
  }

  // The search box and the count line under it, drawn once and then kept (the box keeps focus and the phone keyboard;
  // the count, a live region, is updated in place by found()).
  const search = (state, ctx) => `<form class="stacc-search" role="search" data-stacc-search>
      <label for="stacc-q-${ctx.uid}" class="sr-only">Search Your Stacc</label>
      <input id="stacc-q-${ctx.uid}" type="search" data-filter="q" value="${e(state.filter.q || "")}" placeholder="Search your files and products…" autocomplete="off" maxlength="80" enterkeyhint="search">
    </form>
    <p class="stacc-found" aria-live="polite" data-stacc-found></p>`;

  // shown: { count, total } from the model.
  const found = (state, shown = {}) => (Object.values(state.filter).some(Boolean)
    ? `${shown.count || 0} of ${files(shown.total || 0)} match <button class="link-btn" type="button" data-clear-filters>Clear search and filters</button>`
    : files(shown.total || 0));

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
      ${ctx.filters ? ctx.filters(facets) : ""}
    </div>`;
  }

  // ctx.tools (optional): more for the selected files (js/library-personal.js: collections and tags).
  function selection(count, ctx = {}) {
    return `<div class="stacc-selection" role="status">${count ? `${items(count)} selected
      <button class="btn" type="button" data-download-selected>Download selected</button>
      <button class="link-btn" type="button" data-clear-selection>Clear</button>${ctx.tools ? ctx.tools(count) : ""}` : "Tick files to download several at once."}</div>`;
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
      `<li><a class="tile" href="${e(p.path || `/shop/${p.id}`)}"><span class="tag">${e(p.projectName || ctx.names.project(p.projectId))}</span><strong>${e(p.title)}</strong><span class="price">${p.free ? "Free" : cents(p.priceCents, p.currency)}</span></a></li>`).join("")}</ul></section>`;
  }

  window.GS.libraryView = { search, found, toolbar, treeView, kindView, selection, waiting, following };
})();

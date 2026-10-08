// New releases feed, a drop-in for any [data-release-feed] list: releases (data/music.js, newest first) and store
// items (data/products.js), from every project, each row in its project's look; a store item opens the store filtered
// to its project with it selected. data-limit="6" caps the rows. data-personal (the dashboard only) also asks the store
// what the visitor owns and follows: followed projects rise to the top and owned items are marked. Without it nothing
// private is fetched, so it is safe on public pages. Needs js/util.js and data/projects.js, product-types.js,
// products.js, music.js.
(function () {
  "use strict";

  const { escapeHTML: e, api, projectPath, fmtDate, money, look, shopItemPath } = window.GS;
  const lists = [...document.querySelectorAll("[data-release-feed]")];
  if (!lists.length) return;
  const PROJECTS = window.PROJECTS || [];
  const TYPES = window.PRODUCT_TYPES || {};
  const projectName = (id) => (PROJECTS.find((p) => p.id === id) || {}).name || "";

  function draw(list, owned, followed) {
    const releases = ((window.MUSIC || {}).releases || []).filter((r) => !r.draft).map((r) => ({
      href: projectPath(r.project, "music", r.id), title: r.title, project: r.project, tag: r.type, track: "midi", meta: fmtDate(r.date), date: r.date
    }));
    const products = (window.PRODUCTS || []).map((p) => ({
      href: shopItemPath(p), title: p.title, project: p.project, tag: (TYPES[p.type] || {}).label || p.type, track: p.type === "presets" ? "presets" : p.type === "music" ? "midi" : "samples",
      meta: owned.has(p.id) ? "In Your Stacc ✓" : p.draft ? "Coming soon" : p.price ? money(p.price) : "Free", date: ""
    }));
    const rows = [...releases.sort((a, b) => b.date.localeCompare(a.date)), ...products]
      .map((x, i) => ({ ...x, rank: (followed.has(x.project) ? 0 : 1) * 1000 + i }))
      .sort((a, b) => a.rank - b.rank).slice(0, Number(list.dataset.limit) || 6);
    list.innerHTML = rows.map((x) => `<li class="${look(x.project)}" data-track="${x.track}"><a class="clip" href="${e(x.href)}">
      <span class="clip-title">${e(x.title)}</span>
      <span class="clip-meta"><span class="tag">${e(x.tag)}</span> ${e(projectName(x.project))}${followed.has(x.project) ? " · following" : ""}</span>
      <span class="clip-end">${e(x.meta)}</span></a></li>`).join("") || `<li class="small-print">Nothing released yet.</li>`;
  }

  lists.forEach((list) => draw(list, new Set(), new Set()));
  const personal = lists.filter((list) => "personal" in list.dataset);
  if (!personal.length) return;
  (async () => {
    const [library, projects] = await Promise.all([api("/api/library"), api("/api/projects")]);
    const owned = new Set(library.ok && library.data.signedIn ? library.data.items.map((it) => it.productId) : []);
    const followed = new Set(projects.ok && projects.data.follows ? projects.data.follows.map((f) => f.projectId) : []);
    personal.forEach((list) => draw(list, owned, followed));
  })();
})();

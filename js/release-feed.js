// New releases feed, a drop-in for any [data-release-feed] list: published releases (the content API through
// js/project-content.js, newest first) and store items (data/products.js), from every project, each row in its
// project's look; a store item opens the store filtered to its project with it selected. data-limit="6" caps the rows.
// data-personal (the dashboard only) also asks the store what the visitor owns and follows: followed projects rise to
// the top and owned items are marked. Without it nothing private is fetched, so it is safe on public pages. Needs
// js/util.js, js/project-content.js and data/projects.js, product-types.js, products.js.
(function () {
  "use strict";

  const { escapeHTML: e, api, fmtDate, money, look, shopItemPath, content } = window.GS;
  const lists = [...document.querySelectorAll("[data-release-feed]")];
  if (!lists.length || !content) return;
  const PROJECTS = window.PROJECTS || [];
  const TYPES = window.PRODUCT_TYPES || {};
  const names = new Map(); // project names the content API gave, for projects this page's data doesn't list
  const projectName = (id) => (PROJECTS.find((p) => p.id === id) || {}).name || names.get(id) || "";
  let RELEASES = [];

  function draw(list, owned, followed) {
    const releases = RELEASES.filter((r) => !r.draft).map((r) => ({
      href: content.href(r, "music"), title: r.title, project: r.project, tag: r.type, track: "midi", meta: fmtDate(r.date), date: r.date
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

  // Store items show at once; releases join when the content API answers, and personal lists once the store says
  // what the visitor owns and follows.
  lists.forEach((list) => draw(list, new Set(), new Set()));
  const personal = lists.filter((list) => "personal" in list.dataset);
  let mine = { owned: new Set(), followed: new Set() };
  const drawAll = () => lists.forEach((list) => ("personal" in list.dataset ? draw(list, mine.owned, mine.followed) : draw(list, new Set(), new Set())));
  content.latest().then((got) => {
    RELEASES = got.releases;
    for (const r of RELEASES) if (r.projectName) names.set(r.project, r.projectName);
    drawAll();
  });
  if (!personal.length) return;
  (async () => {
    const [library, projects] = await Promise.all([api("/api/library"), api("/api/projects")]);
    mine = {
      owned: new Set(library.ok && library.data.signedIn ? library.data.items.map((it) => it.productId) : []),
      followed: new Set(projects.ok && projects.data.follows ? projects.data.follows.map((f) => f.projectId) : [])
    };
    personal.forEach((list) => draw(list, mine.owned, mine.followed));
  })();
})();

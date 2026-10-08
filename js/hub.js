// The hub (/): Your Stacc at a glance (content-type meters and what was added last, from the store API through
// GS.stacc) and the new releases feed (releases and products from data/, followed projects first, owned ones marked).
// The projects rack is js/projects.js. Signed out or offline, each panel says what it does instead. Needs js/util.js,
// js/stacc-model.js and data/projects.js, stacclets.js, pacs.js, content-types.js, product-types.js, products.js,
// music.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api, projectPath, fmtDate, money, look, shopItemPath } = window.GS;
  const stacc = $("#hub-stacc");
  const feed = $("#hub-releases");
  if (!stacc || !feed) return;
  const catalog = { projects: window.PROJECTS || [], stacclets: window.STACCLETS || [], pacs: window.PACS || [], contentTypes: window.CONTENT_TYPES || {} };
  const projectName = (id) => (catalog.projects.find((p) => p.id === id) || {}).name || "";
  const TYPES = window.PRODUCT_TYPES || {};

  // Your Stacc: one meter per content type, scaled to the biggest, then the latest additions.
  function drawStacc(items) {
    const assets = window.GS.stacc.assetsFrom(items, catalog);
    if (!assets.length) {
      stacc.innerHTML = `<p>${items.length ? "Your items are in; their files are on the way." : "Nothing in your Stacc yet. Everything you buy, claim or Auto-Stacc lands here, sorted for you."}</p>
        <div class="actions"><a class="btn" href="/shop">Browse the store</a><a class="btn ghost" href="/projects">Follow projects</a></div>`;
      return;
    }
    const groups = window.GS.stacc.byKind(assets, catalog);
    const max = Math.max(...groups.map((g) => g.assets.length));
    const recent = [...items].sort((a, b) => String(b.grantedAt).localeCompare(String(a.grantedAt))).slice(0, 4);
    stacc.innerHTML = `<p class="hub-total"><strong>${assets.length}</strong> file${assets.length === 1 ? "" : "s"} from <strong>${items.length}</strong> item${items.length === 1 ? "" : "s"}</p>
      <ul class="meters">${groups.map((g) => `<li data-track="${e(g.kind)}"><span class="meter-label">${e(g.label)}</span>
        <span class="meter" aria-hidden="true"><span style="--level:${(g.assets.length / max).toFixed(3)}"></span></span><span class="meter-count">${g.assets.length}</span></li>`).join("")}</ul>
      <h3 class="hub-sub">Latest</h3>
      <ul class="hub-recent">${recent.map((it) => `<li><a href="/library">${e(it.title)}</a><span class="small-print">${e(projectName(it.projectId))}${it.sources.includes("auto") ? " · auto-stacc'd" : ""}</span></li>`).join("")}</ul>`;
  }

  async function loadStacc() {
    const res = await api("/api/library");
    if (res.ok) {
      drawStacc(res.data.items);
      return { owned: new Set(res.data.items.map((it) => it.productId)) };
    }
    stacc.innerHTML = res.status === 401
      ? `<p>Everything you buy or claim lands here, sorted by project, Stacclet, Pac and content type. Download one file or a whole Pac.</p>
        <div class="actions"><a class="btn" href="/login?next=/">Log in</a><a class="btn ghost" href="/login?next=/#signup">Create account</a></div>`
      : `<p class="small-print">${res.status === 503 ? "The store is offline for maintenance; your files are safe." : "Couldn't reach the store right now."} <a href="/library">Open Your Stacc</a></p>`;
    return { owned: new Set() };
  }

  // Releases (dated) and products (newest data first), from every project; followed projects rise to the top. Each row
  // wears its project's look; a store item opens the store filtered to its project with it selected.
  function drawFeed(owned, followed) {
    const releases = ((window.MUSIC || {}).releases || []).filter((r) => !r.draft).map((r) => ({
      href: projectPath(r.project, "music", r.id), title: r.title, project: r.project, tag: r.type, track: "midi", meta: fmtDate(r.date), date: r.date
    }));
    const products = (window.PRODUCTS || []).map((p) => ({
      href: shopItemPath(p), title: p.title, project: p.project, tag: (TYPES[p.type] || {}).label || p.type, track: p.type === "presets" ? "presets" : p.type === "music" ? "midi" : "samples",
      meta: owned.has(p.id) ? "In your Stacc ✓" : p.draft ? "Coming soon" : p.price ? money(p.price) : "Free", date: ""
    }));
    const rows = [...releases.sort((a, b) => b.date.localeCompare(a.date)), ...products]
      .map((x, i) => ({ ...x, rank: (followed.has(x.project) ? 0 : 1) * 1000 + i }))
      .sort((a, b) => a.rank - b.rank).slice(0, 6);
    feed.innerHTML = rows.map((x) => `<li class="${look(x.project)}" data-track="${x.track}"><a class="clip" href="${e(x.href)}">
      <span class="clip-title">${e(x.title)}</span>
      <span class="clip-meta"><span class="tag">${e(x.tag)}</span> ${e(projectName(x.project))}${followed.has(x.project) ? " · following" : ""}</span>
      <span class="clip-end">${e(x.meta)}</span></a></li>`).join("") || `<li class="small-print">Nothing released yet.</li>`;
  }

  drawFeed(new Set(), new Set());
  (async () => {
    const [{ owned }, projects] = await Promise.all([loadStacc(), api("/api/projects")]);
    const followed = new Set(projects.ok && projects.data.follows ? projects.data.follows.map((f) => f.projectId) : []);
    drawFeed(owned, followed);
  })();
})();

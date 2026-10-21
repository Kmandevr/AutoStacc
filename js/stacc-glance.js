// Your Stacc at a glance, a drop-in for any [data-stacc-glance] element: one meter per content type (scaled to the
// biggest) and what was added last, through GS.stacc. data-project counts only that project's items (and wears its
// look); data-limit="4" caps the latest additions. Signed-out visitors (with no guest order) get a link to log in. Needs js/util.js,
// js/stacc-model.js and data/projects.js, content-types.js (js/skeleton.js optional: placeholder meter lines while
// loading); Stacclets and Pacs are named by /api/library.
(function () {
  "use strict";

  const { escapeHTML: e, api, loginPath, wear, skeleton: sk } = window.GS;
  const boxes = [...document.querySelectorAll("[data-stacc-glance]")];
  if (!boxes.length) return;
  const catalog = { projects: window.PROJECTS || [], stacclets: [], pacs: [], contentTypes: window.CONTENT_TYPES || {}, kindAliases: window.CONTENT_TYPE_ALIASES || {} };
  const projectName = (id, item) => (catalog.projects.find((p) => p.id === id) || {}).name || item.projectName || "";

  function draw(box, all) {
    const project = box.dataset.project || "";
    const assets = window.GS.stacc.assetsFrom(all, catalog).filter((a) => !project || a.projectId === project);
    const items = project ? all.filter((it) => it.projectId === project || assets.some((a) => a.productId === it.productId)) : all;
    if (!assets.length) {
      box.innerHTML = `<p>${items.length ? "Your items are in. Their files are on the way." : "Nothing in Your Stacc yet. Everything you buy or claim lands here, sorted for you."}</p>
        <div class="actions"><a class="btn" href="/shop">Browse the store</a><a class="btn ghost" href="/projects">Follow projects</a></div>`;
      return;
    }
    const groups = window.GS.stacc.byKind(assets, catalog);
    const max = Math.max(...groups.map((g) => g.assets.length));
    const recent = [...items].sort((a, b) => String(b.grantedAt).localeCompare(String(a.grantedAt))).slice(0, Number(box.dataset.limit) || 4);
    box.innerHTML = `<p class="dash-total"><strong>${assets.length}</strong> file${assets.length === 1 ? "" : "s"} from <strong>${items.length}</strong> item${items.length === 1 ? "" : "s"}</p>
      <ul class="meters">${groups.map((g) => `<li data-track="${e(g.kind)}"><span class="meter-label">${e(g.label)}</span>
        <span class="meter" aria-hidden="true"><span style="--level:${(g.assets.length / max).toFixed(3)}"></span></span><span class="meter-count">${g.assets.length}</span></li>`).join("")}</ul>
      <h3 class="dash-sub">Latest</h3>
      <ul class="dash-recent">${recent.map((it) => `<li><a href="/library">${e(it.title)}</a><span class="small-print">${e(projectName(it.projectId, it))}${it.sources.includes("auto") ? " · added by Auto-Stacc" : ""}</span></li>`).join("")}</ul>`;
  }

  boxes.forEach((box) => { wear(box, box.dataset.project); if (sk) sk.show(box, "line", 6); });
  (async () => {
    const library = await api("/api/library");
    boxes.forEach((box) => {
      if (sk) sk.done(box);
      if (library.status === 401 || (library.ok && !library.data.signedIn && !library.data.items.length)) {
        box.innerHTML = `<p class="small-print"><a href="${e(loginPath(location.pathname + location.search))}">Log in</a> to open Your Stacc.</p>`;
      } else if (library.ok) {
        catalog.stacclets = library.data.stacclets || [];
        catalog.pacs = library.data.pacs || [];
        draw(box, library.data.items);
      } else {
        box.innerHTML = `<p class="small-print">${library.status === 503 ? "The store is offline for maintenance. Your files are safe." : "Couldn't reach the store right now."} <a href="/library">Open Your Stacc</a></p>`;
      }
    });
  })();
})();

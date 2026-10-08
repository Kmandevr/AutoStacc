// The dashboard (/dashboard), the signed-in workspace: a greeting (and a welcome after confirming an email), Your Stacc
// at a glance (one meter per content type and what was added last, through GS.stacc) for [data-dashboard-stacc]. The
// releases feed (js/release-feed.js) and the projects rack (js/projects.js) are their own modules. The server only
// serves this page to a signed-in visitor (server/pages/guard.js); if the session ends, this script sends the visitor
// to log in and back. Needs js/util.js, js/stacc-model.js and data/projects.js, stacclets.js, pacs.js, content-types.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api, loginPath } = window.GS;
  const stacc = $("[data-dashboard-stacc]");
  const hello = $("[data-dashboard-hello]");
  if (!stacc) return;
  const catalog = { projects: window.PROJECTS || [], stacclets: window.STACCLETS || [], pacs: window.PACS || [], contentTypes: window.CONTENT_TYPES || {} };
  const projectName = (id) => (catalog.projects.find((p) => p.id === id) || {}).name || "";
  const toLogin = () => location.replace(loginPath(location.pathname + location.search));

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
    stacc.innerHTML = `<p class="dash-total"><strong>${assets.length}</strong> file${assets.length === 1 ? "" : "s"} from <strong>${items.length}</strong> item${items.length === 1 ? "" : "s"}</p>
      <ul class="meters">${groups.map((g) => `<li data-track="${e(g.kind)}"><span class="meter-label">${e(g.label)}</span>
        <span class="meter" aria-hidden="true"><span style="--level:${(g.assets.length / max).toFixed(3)}"></span></span><span class="meter-count">${g.assets.length}</span></li>`).join("")}</ul>
      <h3 class="dash-sub">Latest</h3>
      <ul class="dash-recent">${recent.map((it) => `<li><a href="/library">${e(it.title)}</a><span class="small-print">${e(projectName(it.projectId))}${it.sources.includes("auto") ? " · auto-stacc'd" : ""}</span></li>`).join("")}</ul>`;
  }

  (async () => {
    const [me, library] = await Promise.all([api("/api/account"), api("/api/library")]);
    if (me.status === 401 || (me.ok && !me.data.user) || library.status === 401) return toLogin();
    if (me.ok && hello) {
      const welcome = new URLSearchParams(location.search).get("welcome");
      hello.textContent = welcome ? "Email confirmed. Welcome in." : `Welcome back, ${me.data.user.name || "you"}.`;
    }
    if (library.ok) return drawStacc(library.data.items);
    stacc.innerHTML = `<p class="small-print">${library.status === 503 ? "The store is offline for maintenance; your files are safe." : "Couldn't reach the store right now."} <a href="/library">Open Your Stacc</a></p>`;
  })();
})();

// Projects to follow, a drop-in for any [data-project-picks] (the home page): a few projects from GET
// /api/projects/browse, signed-in visitors' unfollowed ones first, ordered by how well their genres and styles match
// this browser's own history (js/taste.js: filters used and genres picked; read here, never sent). Each card says why
// it was picked. data-limit="3" caps the cards. Offline, the built list inside stays. Needs js/util.js,
// js/project-card.js, data/product-types.js; js/taste.js optional; js/follow.js fills the follow controls.
(function () {
  "use strict";

  const GS = window.GS;
  const { api, escapeHTML: e } = GS;
  const roots = [...document.querySelectorAll("[data-project-picks]")];
  if (!roots.length || !GS.projectCard) return;

  // How much this browser's history leans to each genre or style ("genre:edm" -> weight).
  function leanings() {
    const t = GS.taste;
    if (!t || !t.enabled()) return new Map();
    const p = t.profile(), out = new Map();
    for (const [facet, values] of Object.entries(p.filters || {})) for (const [v, n] of Object.entries(values)) out.set(`${facet}:${v}`, (out.get(`${facet}:${v}`) || 0) + n);
    for (const [facet, values] of Object.entries(p.prefs || {})) for (const v of values) out.set(`${facet}:${v}`, (out.get(`${facet}:${v}`) || 0) + 3);
    return out;
  }

  function pick(projects, limit) {
    const lean = leanings();
    return projects.map((p, i) => {
      const hits = p.genres.filter((g) => lean.has(`${g.facet}:${g.value}`));
      const score = hits.reduce((s, g) => s + lean.get(`${g.facet}:${g.value}`), 0);
      const why = hits.length ? `Matches ${hits.slice(0, 2).map((g) => g.label).join(" and ")}, which you browse` : p.following ? "You follow it" : p.recent ? "Active lately" : "";
      return { p, why, rank: (p.following ? 1e6 : 0) - score * 100 + i };
    }).sort((a, b) => a.rank - b.rank).slice(0, limit);
  }

  async function load(root) {
    const limit = Number(root.dataset.limit) || 3;
    const res = await api("/api/projects/browse");
    if (!res.ok || !res.data.projects.length) return;
    const chosen = pick(res.data.projects, limit);
    root.innerHTML = `<div class="pgrid pgrid-row">${chosen.map(({ p, why }) => GS.projectCard(p, { level: 3 }).replace('<p class="pcard-activity">', `${why ? `<p class="pcard-why">${e(why)}</p>` : ""}<p class="pcard-activity">`)).join("")}</div>`;
    dispatchEvent(new CustomEvent("gs:projects"));
  }
  roots.forEach(load);
})();

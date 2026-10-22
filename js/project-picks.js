// Projects to follow, a drop-in for any [data-project-picks] (the home page): a few projects from GET
// /api/projects/browse, ordered by how well their genres and styles match this browser's own history (js/taste.js:
// filters used and genres picked; read here, never sent). Each card says why it was picked; projects the visitor
// already follows are left out. data-picks="following" lists those instead (the dashboard), most recently active
// first. data-limit="3" caps the cards. Offline, the built list inside stays. Needs js/util.js, js/project-card.js,
// data/product-types.js; js/taste.js optional; js/skeleton.js draws placeholder cards where no built list stands;
// js/follow.js fills the follow controls.
(function () {
  "use strict";

  const GS = window.GS;
  const { api } = GS;
  const sk = GS.skeleton;
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
      const why = hits.length ? `Matches ${hits.slice(0, 2).map((g) => g.label).join(" and ")}, which you browse` : p.recent ? "Active lately" : "";
      return { p, why, rank: -score * 100 + i };
    }).sort((a, b) => a.rank - b.rank).slice(0, limit);
  }

  // One request per question, however many roots ask it (the dashboard has two).
  const asked = new Map();
  const ask = (qs) => (asked.has(qs) ? asked.get(qs) : asked.set(qs, api(`/api/projects/browse?${qs}`)).get(qs));

  async function load(root) {
    const limit = Number(root.dataset.limit) || 3;
    const following = root.dataset.picks === "following";
    // Placeholder cards while it asks, unless a built list of real cards is already there (the home page); the note
    // that was there comes back if nothing replaces it.
    const before = root.innerHTML;
    if (sk && !root.querySelector(".project-card, .pcard")) {
      root.innerHTML = `<div class="pgrid"></div>`;
      sk.show(root.firstElementChild, "card", limit);
    }
    const res = await ask(following ? "followed=1" : "");
    const restore = () => { if (root.innerHTML !== before) root.innerHTML = before; };
    if (!res.ok) return restore();
    const list = res.data.projects.filter((p) => Boolean(p.following) === following);
    if (following && !list.length) {
      root.innerHTML = `<p class="small-print">${res.data.signedIn ? "You don't follow any projects yet." : "Log in to see the projects you follow."} <a href="/discover">Find projects to follow</a>.</p>`;
      return;
    }
    if (!list.length) return restore();
    const chosen = following ? list.slice(0, limit).map((p) => ({ p, why: "" })) : pick(list, limit);
    root.innerHTML = `<div class="pgrid">${chosen.map(({ p, why }) => GS.projectCard(p, { level: 3, why })).join("")}</div>`;
    dispatchEvent(new CustomEvent("gs:projects"));
  }
  roots.forEach(load);
})();

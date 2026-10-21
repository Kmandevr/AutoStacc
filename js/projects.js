// Project cards in every [data-project-list] on the page (the dashboard's projects rack, the home page and a creator's
// profile, which sets data-creator): the projects in data/projects.js, each with a slot for js/follow.js (Follow,
// Unfollow and the Auto-Stacc switch). The /projects page itself is the projects browser (js/projects-browse.js).
// Needs data/projects.js and js/util.js; load js/follow.js for the controls.
(function () {
  "use strict";

  const { escapeHTML: e } = window.GS;
  const lists = [...document.querySelectorAll("[data-project-list]")];
  if (!lists.length) return;
  const projects = (window.PROJECTS || []).filter((p) => !p.draft);
  const FEATURES = { releases: "Releases", events: "Events", store: "Store", polls: "Polls", relationships: "Song connections" };

  // Each card wears its project's look; a project with a full logo shows it as the card's heading.
  const name = (p) => (p.logoFull
    ? `<img class="project-logo-full" src="/${e(p.logoFull.src)}" width="${e(p.logoFull.width)}" height="${e(p.logoFull.height)}" alt="${e(p.name)}">`
    : `${p.logo ? `<img class="project-logo" src="/${e(p.logo)}" width="56" height="56" alt="">` : ""}${e(p.name)}`);
  const card = (p) => `<li class="project-card ${window.GS.look(p.id)}" data-project="${e(p.id)}">
      <h3><a href="${e(window.GS.projectPath(p.id))}">${name(p)}</a></h3>
      <p>${e(p.summary || "")}</p>
      <p class="project-features">${(p.features || []).map((f) => `<span class="tag">${e(FEATURES[f] || f)}</span>`).join(" ")}</p>
      <div class="project-follow" data-follow-slot="${e(p.id)}" data-name="${e(p.name)}"></div>
    </li>`;
  // A creator's profile page lists only that creator's projects (<ul data-creator>).
  lists.forEach((list) => (list.innerHTML = projects.filter((p) => !list.dataset.creator || p.creator === list.dataset.creator).map(card).join("")));
  dispatchEvent(new CustomEvent("gs:projects"));
})();

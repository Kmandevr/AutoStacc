// Official profiles, a drop-in for any [data-profiles] element: a button per profile a project has set (data/projects.js
// `socials`). data-project picks the project (default: the open project's). Outside the project's pages it wears the
// project's look. Needs data/projects.js and js/util.js.
(function () {
  "use strict";

  const { escapeHTML, isSet, moduleProject, wear } = window.GS;
  const PROJECTS = window.PROJECTS || [];

  document.querySelectorAll("[data-profiles]").forEach((el) => {
    const id = moduleProject(el);
    const project = PROJECTS.find((p) => p.id === id) || {};
    wear(el, id);
    el.innerHTML = (project.socials || [])
      .filter((s) => isSet(s.url))
      .map((s) => `<a class="btn ghost" href="${escapeHTML(s.url)}" target="_blank" rel="me noopener">${escapeHTML(s.name)}</a>`)
      .join("");
  });
})();

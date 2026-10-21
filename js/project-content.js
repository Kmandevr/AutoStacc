// Project content client (GS.content): the releases and upcoming events every creator publishes in the Studio,
// first-party included, read from the content API (server/content/routes.js) as { releases, events }. project(id)
// gives one project's, latest() every project's newest, forProject(id) the one or (no id) the other. Each address is
// fetched once per page and never throws: offline, it is empty lists. Also href() (an item's own page) and art() (a
// safe root-relative image address). Needs js/util.js.
(function () {
  "use strict";

  const GS = window.GS;
  const EMPTY = Object.freeze({ releases: [], events: [] });
  const list = (v) => (Array.isArray(v) ? v : []);
  const asked = new Map();

  function once(path) {
    if (!asked.has(path)) {
      asked.set(path, GS.api(path).then((res) => (res.ok && res.data
        ? { releases: list(res.data.releases), events: list(res.data.events) }
        : EMPTY)));
    }
    return asked.get(path);
  }

  const project = (id) => (id ? once(`/api/projects/${encodeURIComponent(id)}/content`) : Promise.resolve(EMPTY));
  // The API returns at most 50 of each kind.
  const latest = (limit = 50) => once(`/api/content/latest?limit=${Math.min(50, Math.max(1, Math.floor(Number(limit)) || 12))}`);
  const forProject = (id) => (id ? project(id) : latest());

  // An item's page: the address the API gives, else the project's folder for it (music, events).
  const href = (x, folder) => x.path || GS.projectPath(x.project, ...(folder ? [folder, x.id] : []));
  // Artwork comes as /media/sites/<id> (Studio uploads) or a site path (/img/..., or img/... in older data); anything
  // else (another site, a scheme) is refused so a stored value can't point the page somewhere unexpected.
  function art(src) {
    const s = String(src || "");
    if (!s || s.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(s)) return "";
    return s.startsWith("/") ? s : "/" + s;
  }

  GS.content = { project, latest, forProject, href, art, EMPTY };
})();

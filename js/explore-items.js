// Releases, news and shows across projects (GS.exploreItems), the model behind /explore (js/explore-browse.js) and the
// [data-latest] lists (js/latest.js): every published release, news post and upcoming show of a visible project, from
// the content API (js/project-content.js, which load() reads), in one shape ({ view, id, project, date, title, href,
// ... }) made by from(), plus the filter, facet-count and search rules (OR within a filter, AND between filters, each
// filter's counts without itself). No DOM. Needs js/util.js, data/projects.js and (for load) js/project-content.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { projectPath } = GS;
  const projectName = (id) => ((window.PROJECTS || []).find((p) => p.id === id) || {}).name || id;
  const nameOf = (x) => x.projectName || projectName(x.project);
  const hrefOf = (x, folder) => x.path || projectPath(x.project, ...(folder ? [folder, x.id] : []));
  const today = () => new Date().toISOString().slice(0, 10);

  // Filters each view offers: [key, title, value of an item].
  const FILTERS = {
    releases: [["project", "Project", (x) => x.project], ["type", "Type", (x) => x.type], ["year", "Year", (x) => x.date.slice(0, 4)]],
    news: [["project", "Project", (x) => x.project], ["tag", "Topic", (x) => x.tag], ["year", "Year", (x) => x.date.slice(0, 4)]],
    shows: [["project", "Project", (x) => x.project], ["city", "City", (x) => x.city]]
  };

  // The API sends only published items of visible projects; a draft flag or a project this page knows as a draft is
  // still left out, so nothing unpublished ever shows.
  const live = (x) => x && x.project && x.date && !x.draft && !((window.PROJECTS || []).find((p) => p.id === x.project) || {}).draft;
  const list = (v) => (Array.isArray(v) ? v : []);

  // content: { releases, news, shows } as the content API returns them.
  function from(content) {
    const c = content || {};
    const releases = list(c.releases).filter(live).map((r) => ({
      view: "releases", id: r.id, project: r.project, projectName: nameOf(r), date: r.date, title: r.title, type: r.type || "Release",
      artwork: r.artwork || null, text: (r.description || "").slice(0, 200), tracks: list(r.tracks).length, href: hrefOf(r, "music")
    }));
    const news = list(c.news).filter(live).map((n) => ({
      view: "news", id: n.id, project: n.project, projectName: nameOf(n), date: n.date, title: n.title, tag: n.tag || "News",
      text: n.summary || "", href: hrefOf(n, "news")
    }));
    const shows = list(c.shows).filter((s) => live(s) && s.date >= today()).map((s, i) => ({
      view: "shows", id: `${s.project}-${s.date}-${i}`, project: s.project, projectName: nameOf(s), date: s.date,
      title: s.venue || s.city, city: s.city || "", venue: s.venue || "", ticketUrl: s.ticketUrl || "", href: s.projectPath || projectPath(s.project)
    }));
    return { releases, news, shows };
  }
  // Every project's newest, from the content API. Never rejects: offline, the lists are empty.
  const load = () => (GS.content ? GS.content.latest() : Promise.resolve({})).then(from);

  // items: one view's items; f: { q, <filter key>: [values] }. Newest first, shows soonest first.
  function query(view, items, f) {
    const words = (f.q || "").toLowerCase().split(/\s+/).filter(Boolean);
    const text = (x) => [x.title, x.projectName, x.type, x.tag, x.city, x.venue, x.text].filter(Boolean).join(" ").toLowerCase();
    const filters = FILTERS[view];
    const pass = (x, skip) => words.every((w) => text(x).includes(w))
      && filters.every(([key, , get]) => key === skip || !(f[key] || []).length || f[key].includes(get(x)));
    const facets = filters.map(([key, title, get]) => {
      const counts = new Map();
      for (const x of items.filter((y) => pass(y, key))) counts.set(get(x), (counts.get(get(x)) || 0) + 1);
      for (const v of f[key] || []) if (!counts.has(v)) counts.set(v, 0);
      const label = key === "project" ? projectName : (v) => v;
      return { key, title, values: [...counts].map(([value, count]) => ({ value, label: label(value), count, selected: (f[key] || []).includes(value) }))
        .sort((a, b) => (key === "year" ? b.value.localeCompare(a.value) : b.count - a.count || a.label.localeCompare(b.label))) };
    });
    const hits = items.filter((x) => pass(x)).sort((a, b) => (view === "shows" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));
    return { hits, facets };
  }

  GS.exploreItems = { from, load, query, FILTERS, projectName };
})();

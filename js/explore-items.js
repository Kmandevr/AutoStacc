// Releases, news and shows across projects (GS.exploreItems), the model behind /explore (js/explore-browse.js) and the
// [data-latest] lists (js/latest.js): every published release, news post and upcoming show of a published project
// from data/music.js, news.js and shows.js, in one shape ({ view, id, project, date, title, href, ... }), plus the
// filter, facet-count and search rules (OR within a filter, AND between filters, each filter's counts without itself).
// No DOM. Needs js/util.js and data/projects.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { projectPath } = GS;
  const projectName = (id) => ((window.PROJECTS || []).find((p) => p.id === id) || {}).name || id;
  const today = () => new Date().toISOString().slice(0, 10);

  // Filters each view offers: [key, title, value of an item].
  const FILTERS = {
    releases: [["project", "Project", (x) => x.project], ["type", "Type", (x) => x.type], ["year", "Year", (x) => x.date.slice(0, 4)]],
    news: [["project", "Project", (x) => x.project], ["tag", "Topic", (x) => x.tag], ["year", "Year", (x) => x.date.slice(0, 4)]],
    shows: [["project", "Project", (x) => x.project], ["city", "City", (x) => x.city]]
  };

  // Only what is published: the item and its project (a draft project's items never show).
  const live = (x) => !x.draft && (window.PROJECTS || []).some((p) => p.id === x.project && !p.draft);

  function all() {
    const releases = ((window.MUSIC || {}).releases || []).filter(live).map((r) => ({
      view: "releases", id: r.id, project: r.project, projectName: projectName(r.project), date: r.date, title: r.title, type: r.type || "Release",
      artwork: r.artwork || null, text: (r.description || "").slice(0, 200), tracks: (r.tracks || []).length, href: projectPath(r.project, "music", r.id)
    }));
    const news = (window.NEWS || []).filter(live).map((n) => ({
      view: "news", id: n.id, project: n.project, projectName: projectName(n.project), date: n.date, title: n.title, tag: n.tag || "News",
      text: n.summary || "", href: projectPath(n.project, "news", n.id)
    }));
    const shows = (window.SHOWS || []).filter((s) => live(s) && s.date >= today()).map((s, i) => ({
      view: "shows", id: `${s.project}-${s.date}-${i}`, project: s.project, projectName: projectName(s.project), date: s.date,
      title: s.venue || s.city, city: s.city || "", venue: s.venue || "", ticketUrl: s.ticketUrl || "", href: projectPath(s.project)
    }));
    return { releases, news, shows };
  }

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

  GS.exploreItems = { all, query, FILTERS, projectName };
})();

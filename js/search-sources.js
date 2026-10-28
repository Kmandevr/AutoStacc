// Where the site-wide search looks (owner, 2026-10-27, #230; GS.searchSources, for js/site-search.js and
// js/search-page.js): the store, creators and projects, the community, help and guides, and tags, each asked through
// its own public API at once, so no module reads another's data. A query starting with "#" is a tag: the store,
// creators and projects match it among their tags and words, the community lists the takes tagged with it. Help is
// searched in the browser from the guide index (data/guide-index.js, loaded the first time it's needed). Each source
// answers [{ title, sub, path }] or [] when it can't be reached, so one being down never empties the rest. Needs js/util.js.
(function () {
  "use strict";
  const GS = window.GS;
  if (!GS) return;
  const enc = encodeURIComponent;
  const ok = (r, pick) => (r && r.ok ? pick(r.data) : []);

  let guides = null;
  const guideIndex = () => guides || (guides = new Promise((resolve) => {
    if (window.GUIDE_INDEX) return resolve(window.GUIDE_INDEX);
    const s = document.createElement("script");
    s.src = "/data/guide-index.js";
    s.onload = () => resolve(window.GUIDE_INDEX || []);
    s.onerror = () => { guides = null; resolve([]); };
    document.head.append(s);
  }));

  const GROUPS = [
    { key: "store", label: "Store" },
    { key: "makers", label: "Creators & projects" },
    { key: "community", label: "Community" },
    { key: "help", label: "Help" }
  ];

  // Everything for `q`, n per group (the dropdown asks for a few, the results page for more).
  async function find(q, n = 4) {
    const text = String(q || "").trim().slice(0, 80);
    const tag = text.startsWith("#") ? text.slice(1).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") : "";
    const words = tag || text;
    if (words.length < 2) return { tags: [], store: [], makers: [], community: [], help: [] };
    const [tags, store, projects, creators, community, help] = await Promise.all([
      GS.api(`/api/tags/suggest?q=${enc(words)}&limit=${Math.min(n + 2, 8)}`),
      GS.api(`/api/store/search?q=${enc(words)}&per=${Math.max(n, 4)}`),
      GS.api(`/api/projects/browse?q=${enc(tag ? `#${tag}` : words)}`),
      GS.api(`/api/creators?q=${enc(tag ? `#${tag}` : words)}`),
      tag ? GS.api(`/api/community/tagged?tag=${enc(tag)}`) : GS.api(`/api/community/search?q=${enc(words)}`),
      guideIndex()
    ]);
    const lw = words.toLowerCase().split(/[\s-]+/).filter(Boolean);
    return {
      tags: ok(tags, (d) => d.tags).map((t) => ({ title: `#${t.tag}`, sub: `${t.count} tagged`, path: `/search?q=${enc("#" + t.tag)}` })),
      store: ok(store, (d) => d.products || []).slice(0, n).map((p) => ({ title: p.title, sub: [p.typeLabel || p.type, p.projectName].filter(Boolean).join(" · "), path: GS.shopItemPath ? GS.shopItemPath(p) : `/shop/${p.id}` })),
      makers: [...ok(creators, (d) => d.creators || []).map((c) => ({ title: c.name, sub: "Creator", path: c.path })),
        ...ok(projects, (d) => d.projects || []).map((p) => ({ title: p.name, sub: p.creator && p.creator !== p.name ? `Project by ${p.creator}` : "Project", path: p.path }))].slice(0, n),
      community: ok(community, (d) => d.results || []).slice(0, n).map((x) => ({ title: x.title, sub: `${x.space} · ${x.replies} ${x.replies === 1 ? "reply" : "replies"}`, path: x.path })),
      help: (tag ? [] : help.filter((g) => lw.every((w) => `${g.t} ${g.x}`.toLowerCase().includes(w))).slice(0, n)).map((g) => ({ title: g.t, sub: g.s, path: g.p }))
    };
  }

  GS.searchSources = { find, GROUPS };
})();

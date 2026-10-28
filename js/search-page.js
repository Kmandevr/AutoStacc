// The search results page (/search?q=; owner, 2026-10-27, #230): tags first, then tabs (All, Store, Creators &
// projects, Community, Help) over the results of every source (js/search-sources.js), with a link at the foot of each
// group to that area's own search and its filters. The query and tab live in the address. Needs js/util.js and
// js/search-sources.js.
(function () {
  "use strict";
  const GS = window.GS;
  const root = document.querySelector("[data-search-page]");
  if (!GS || !root || !GS.searchSources) return;
  const { escapeHTML: e } = GS;
  const params = new URLSearchParams(location.search);
  const q = (params.get("q") || "").trim().slice(0, 80);
  if (!q) return;
  const enc = encodeURIComponent;
  const tagged = q.startsWith("#");
  const plain = tagged ? q.slice(1) : q;
  // Each area's own search, for "See all" (its filters live there).
  const MORE = {
    store: `/shop?q=${enc(plain)}`,
    makers: `/discover?tab=projects&q=${enc(q)}`,
    community: `/community?q=${enc(plain)}`,
    help: `/help`
  };
  const tabs = [{ key: "all", label: "All" }, ...GS.searchSources.GROUPS];
  let tab = tabs.some((t) => t.key === params.get("tab")) ? params.get("tab") : "all";
  document.title = `${q} · Search · AutoStacc`;
  root.querySelector(".search-title").textContent = `Results for “${q}”`;
  root.querySelector(".search-hint").remove();
  const body = document.createElement("div");
  body.setAttribute("aria-live", "polite");
  body.setAttribute("aria-busy", "true");
  body.innerHTML = '<p class="search-wait">Searching…</p>';
  root.append(body);

  const row = (x) => `<li><a class="search-hit" href="${e(x.path)}"><span>${e(x.title)}</span>${x.sub ? `<small>${e(x.sub)}</small>` : ""}</a></li>`;
  function draw(r) {
    const count = (k) => r[k].length;
    const nav = `<nav class="search-tabs" aria-label="Result groups">${tabs.map((t) => `<a href="?q=${enc(q)}${t.key === "all" ? "" : `&tab=${t.key}`}" data-tab="${t.key}"${t.key === tab ? ' aria-current="page"' : ""}>${e(t.label)}${t.key === "all" ? "" : ` <span>${count(t.key)}</span>`}</a>`).join("")}</nav>`;
    const tags = r.tags.length ? `<p class="search-tags" aria-label="Tags">${r.tags.map((t) => `<a class="search-tag" href="${e(t.path)}">${e(t.title)} <small>${e(t.sub)}</small></a>`).join("")}</p>` : "";
    const groups = GS.searchSources.GROUPS.filter((g) => tab === "all" || g.key === tab).map((g) => r[g.key].length
      ? `<section class="search-group"><h2>${e(g.label)}</h2><ul>${r[g.key].map(row).join("")}</ul><p><a class="search-more" href="${e(MORE[g.key])}">See all and filter in ${e(g.label)}</a></p></section>`
      : tab === g.key ? `<p class="search-none">Nothing in ${e(g.label)} for “${e(q)}”.</p>` : "").join("");
    const none = !r.tags.length && GS.searchSources.GROUPS.every((g) => !r[g.key].length);
    body.innerHTML = nav + tags + (none ? `<p class="search-none">Nothing found for “${e(q)}”. Try fewer or different words${tagged ? ", or the word without #" : ""}.</p>` : groups);
    body.setAttribute("aria-busy", "false");
  }

  GS.searchSources.find(q, 10).then((r) => {
    draw(r);
    body.addEventListener("click", (ev) => {
      const a = ev.target.closest("[data-tab]");
      if (!a) return;
      ev.preventDefault();
      tab = a.dataset.tab;
      history.replaceState(null, "", a.getAttribute("href"));
      draw(r);
      body.querySelector(`[data-tab="${tab}"]`).focus();
    });
  });
})();

// Latest from every project, a drop-in for any [data-latest] (the home page): the newest releases and news posts and
// the next shows (data/music.js, news.js, shows.js through js/explore-items.js; drafts never show), each list linking
// to its view on /explore. Projects the visitor follows come first once js/follow.js says which (gs:follows).
// data-limit="3" caps each list. Needs js/util.js, js/explore-items.js and data/projects.js, music.js, news.js, shows.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { escapeHTML: e, fmtDate, look } = GS;
  const roots = [...document.querySelectorAll("[data-latest]")];
  if (!roots.length || !GS.exploreItems) return;
  const items = GS.exploreItems.all();
  const COLS = [["releases", "New releases", "No releases yet.", "midi"], ["news", "News", "No news yet.", "samples"], ["shows", "Upcoming shows", "No shows announced right now.", "presets"]];

  const line = (x) => `<li class="${look(x.project)}"><a href="${e(x.view === "shows" && x.ticketUrl ? x.ticketUrl : x.href)}"${x.view === "shows" && x.ticketUrl ? ' target="_blank" rel="noopener"' : ""}>
    <span class="latest-title">${e(x.title)}</span>
    <span class="latest-meta">${e(x.type || x.tag || x.city)} · ${e(x.projectName)} · <time datetime="${e(x.date)}">${e(fmtDate(x.date))}</time></span></a></li>`;

  function draw(root, followed) {
    const limit = Number(root.dataset.limit) || 3;
    root.innerHTML = COLS.map(([view, title, empty, track]) => {
      const list = GS.exploreItems.query(view, items[view], {}).hits
        .map((x, i) => ({ x, rank: (followed.has(x.project) ? 0 : 1e4) + i })).sort((a, b) => a.rank - b.rank).slice(0, limit).map((r) => r.x);
      return `<section class="mix-panel latest-col" data-track="${track}" aria-labelledby="latest-${view}">
        <div class="mix-head"><h3 id="latest-${view}">${title}</h3><a href="/explore${view === "releases" ? "" : `?view=${view}`}">All<span class="sr-only"> ${title.toLowerCase()}</span> &rarr;</a></div>
        ${list.length ? `<ul class="latest-list">${list.map(line).join("")}</ul>` : `<p class="small-print">${empty}</p>`}</section>`;
    }).join("");
  }
  roots.forEach((r) => draw(r, new Set()));
  addEventListener("gs:follows", (ev) => roots.forEach((r) => draw(r, new Set((ev.detail && ev.detail.ids) || []))));
})();

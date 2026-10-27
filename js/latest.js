// Latest from every project, a drop-in for any [data-latest] (the home page and dashboard): the newest releases and the
// next upcoming events (the content API through js/project-content.js and js/explore-items.js; only published items),
// each list linking to its view on /discover/explore, events also to the /events calendar. Projects the visitor follows come
// first once js/follow.js says which (gs:follows). data-limit="3" caps each list. Needs js/util.js,
// js/project-content.js, js/explore-items.js and data/projects.js; js/skeleton.js draws placeholder panels until then.
(function () {
  "use strict";

  const GS = window.GS;
  const { escapeHTML: e, fmtDate, look } = GS;
  const roots = [...document.querySelectorAll("[data-latest]")];
  if (!roots.length || !GS.exploreItems) return;
  let items = null; // filled once the content API answers
  let followed = new Set();
  if (GS.skeleton) roots.forEach((r) => GS.skeleton.show(r, "panel", 2)); // one per column, until the content API answers
  const COLS = [["releases", "New releases", "No releases yet.", "midi"], ["events", "Upcoming events", "No events announced right now.", "presets"]];

  const line = (x) => `<li class="${look(x.project)}"><a href="${e(x.href)}">
    <span class="latest-title">${e(x.title)}</span>
    <span class="latest-meta">${e(x.type || x.city)} · ${e(x.projectName)} · <time datetime="${e(x.date)}">${e(fmtDate(x.date))}</time></span></a></li>`;

  function draw(root, n) {
    if (!items) return;
    const limit = Number(root.dataset.limit) || 3;
    if (GS.skeleton) GS.skeleton.done(root);
    root.innerHTML = COLS.map(([view, title, empty, track]) => {
      const list = GS.exploreItems.query(view, items[view], {}).hits
        .map((x, i) => ({ x, rank: (followed.has(x.project) ? 0 : 1e4) + i })).sort((a, b) => a.rank - b.rank).slice(0, limit).map((r) => r.x);
      return `<section class="mix-panel latest-col" data-track="${track}" aria-labelledby="lt${n}-${view}">
        <div class="mix-head"><h3 id="lt${n}-${view}">${title}</h3><a href="/discover/explore${view === "releases" ? "" : `?view=${view}`}">All<span class="sr-only"> ${title.toLowerCase()}</span> &rarr;</a></div>
        ${list.length ? `<ul class="latest-list">${list.map(line).join("")}</ul>` : `<p class="small-print">${empty}</p>`}
        ${view === "events" ? `<p class="latest-more"><a href="/events">Events calendar &rarr;</a></p>` : ""}</section>`;
    }).join("");
  }
  GS.exploreItems.load().then((got) => {
    items = got;
    roots.forEach((r, n) => draw(r, n));
  });
  // Redrawn only when who is followed actually changes, so a focused link isn't swept away for nothing.
  let last = "";
  addEventListener("gs:follows", (ev) => {
    const ids = ((ev.detail && ev.detail.ids) || []).slice().sort(), key = ids.join(",");
    if (key === last) return;
    last = key;
    followed = new Set(ids);
    roots.forEach((r, n) => draw(r, n));
  });
})();

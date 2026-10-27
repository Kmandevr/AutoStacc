// The spotlight banner on the Store and on New & upcoming ([data-spotlight="store"|"explore"]; owner, 2026-10-22):
// the admins' picks for that page first (/api/spotlight), then the fair daily rotation over what the page sells or
// lists (GS.shelves.rotate), five in all, shown only on the page's plain view (no search or filters in the address),
// below the page's main list so nothing above it moves when it arrives.
// Store: products (/api/products). New & upcoming: releases and upcoming events (GS.exploreItems). Needs js/util.js
// and js/browse-shelves.js; New & upcoming also js/explore-items.js and js/project-content.js.
(function () {
  "use strict";
  const GS = window.GS;
  const root = document.querySelector("[data-spotlight]");
  if (!GS || !GS.shelves || !root || location.search) return;
  const { escapeHTML: e } = GS;
  const page = root.dataset.spotlight;
  const KIND = { product: "Product", release: "Release", event: "Event" };

  async function items() {
    if (page === "store") {
      const r = await GS.api("/api/products");
      return r.ok ? r.data.products.map((p) => ({ kind: "product", id: p.id, title: p.title, art: p.artwork || "", path: p.path, line: p.projectName || "" })) : [];
    }
    if (page === "explore" && GS.exploreItems) {
      const got = await GS.exploreItems.load();
      const list = [...(got.releases || []).slice(0, 12), ...(got.events || []).slice(0, 12)];
      return list.map((x) => ({ kind: x.view === "events" ? "event" : "release", id: x.id, title: x.title,
        art: x.artwork && GS.content ? GS.content.art(x.artwork.src) : "", path: x.href, line: [x.projectName, x.date].filter(Boolean).join(" · ") }));
    }
    return [];
  }

  const slide = (x) => `<div class="dspot" data-kind="${e(x.kind)}"><a class="dspot-art" href="${e(x.path)}" tabindex="-1" aria-hidden="true">${x.art
      ? `<img src="${e(x.art)}" alt="" width="320" height="320" loading="lazy">` : `<span>${e((x.title || "?").slice(0, 1).toUpperCase())}</span>`}</a>
    <div class="dspot-body"><p class="card-type">${e(KIND[x.kind] || "")}</p><h2 class="dspot-name">${e(x.title)}</h2>${x.line ? `<p>${e(x.line)}</p>` : ""}
      <a class="btn" href="${e(x.path)}">Open<span class="sr-only"> ${e(x.title)}</span></a></div></div>`;

  (async () => {
    const [pool, picks] = await Promise.all([items(), GS.shelves.picks(page)]);
    const chosen = GS.shelves.rotate(pool.filter((x) => x.path), picks, 5, (x) => `${x.kind}:${x.id}`);
    root.innerHTML = GS.shelves.spotlight(chosen, slide, { label: page === "store" ? "In the spotlight" : "New and upcoming, in the spotlight" });
  })();
})();

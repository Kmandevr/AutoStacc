// The browse layout (GS.shelves; owner, 2026-10-22) shared by Discover, the Store and New & upcoming: a spotlight
// banner (the admins' picks from /api/spotlight first, then a fair rotation: a new order each day over everything the
// page lists, so every creator gets equal turns and nothing is ranked by popularity), sideways rows that scroll and
// snap (arrows on computers, a "See all" end card) and appear only once they hold MIN items, and accessible tabs.
// Templates return HTML strings from a page's own card renderer; values are escaped by those renderers and here.
// Needs js/util.js.
(function () {
  "use strict";
  const GS = window.GS;
  if (!GS) return;
  const { escapeHTML: e } = GS;
  const MIN = 4;

  // A small stable hash, so "today's order" is the same for everyone all day and different tomorrow.
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const today = () => new Date().toISOString().slice(0, 10);

  // The spotlight's items: picks (in order, only those this page has) then the rest in today's fair order, n in all.
  function rotate(pool, picks = [], n = 5, keyOf = (x) => x.id) {
    const byKey = new Map(pool.map((x) => [keyOf(x), x]));
    const chosen = picks.map((p) => byKey.get(p)).filter(Boolean);
    const taken = new Set(chosen.map(keyOf));
    const day = today();
    const rest = pool.filter((x) => !taken.has(keyOf(x))).sort((a, b) => hash(day + keyOf(a)) - hash(day + keyOf(b)));
    return [...chosen, ...rest].slice(0, n);
  }

  // The admins' picks for a page, as "kind:id" keys (empty when the store doesn't answer).
  async function picks(page) {
    const r = await GS.api(`/api/spotlight?page=${encodeURIComponent(page)}`);
    return r.ok ? r.data.picks.map((p) => `${p.kind}:${p.id}`) : [];
  }

  // The banner: one big item at a time, with dots to move between them (render(item) gives the slide's inner HTML).
  function spotlight(items, render, { label = "Spotlight" } = {}) {
    if (!items.length) return "";
    return `<section class="spot" aria-roledescription="carousel" aria-label="${e(label)}" data-spot>
      <div class="spot-track">${items.map((x, i) => `<div class="spot-slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${items.length}"${i ? " hidden" : ""}>${render(x)}</div>`).join("")}</div>
      ${items.length > 1 ? `<div class="spot-dots">${items.map((_, i) => `<button type="button" data-spot-go="${i}" aria-label="Show ${i + 1} of ${items.length}"${i ? "" : ' aria-current="true"'}></button>`).join("")}</div>` : ""}
    </section>`;
  }

  // A sideways row; "" when it has fewer than MIN items (a half-empty row looks worse than none).
  function row({ title, items, render, seeAll = "", id = "" }) {
    if (!items || items.length < MIN) return "";
    const head = `row-${id || hash(title)}`;
    return `<section class="shelf" aria-labelledby="${e(head)}">
      <div class="shelf-head"><h2 id="${e(head)}">${e(title)}</h2>
        <span class="shelf-arrows"><button type="button" data-shelf-step="-1" aria-label="Scroll ${e(title)} back">‹</button><button type="button" data-shelf-step="1" aria-label="Scroll ${e(title)} on">›</button></span></div>
      <ul class="shelf-row" role="list">${items.map((x) => `<li>${render(x)}</li>`).join("")}${seeAll ? `<li class="shelf-all"><a href="${e(seeAll)}">See all<span class="sr-only"> ${e(title)}</span></a></li>` : ""}</ul>
    </section>`;
  }

  // Tabs: a role="tablist" of buttons; select(id) is called with the chosen tab (also on arrow keys).
  function tabs(container, list, current, select) {
    container.innerHTML = `<div class="shelf-tabs" role="tablist">${list.map(([id, label]) => `<button type="button" role="tab" data-tab="${e(id)}" aria-selected="${id === current}" tabindex="${id === current ? 0 : -1}">${e(label)}</button>`).join("")}</div>`;
    const btns = [...container.querySelectorAll("[role=tab]")];
    const go = (i, focus) => { btns.forEach((b, j) => { b.setAttribute("aria-selected", String(i === j)); b.tabIndex = i === j ? 0 : -1; }); if (focus) btns[i].focus(); select(btns[i].dataset.tab); };
    btns.forEach((b, i) => {
      b.addEventListener("click", () => go(i, false));
      b.addEventListener("keydown", (ev) => { const s = { ArrowRight: 1, ArrowLeft: -1 }[ev.key]; if (s) { ev.preventDefault(); go((i + s + btns.length) % btns.length, true); } });
    });
  }

  // One listener for every row's arrows and every banner's dots, wherever they are drawn.
  document.addEventListener("click", (ev) => {
    const step = ev.target.closest("[data-shelf-step]");
    if (step) {
      const r = step.closest(".shelf").querySelector(".shelf-row");
      r.scrollBy({ left: Number(step.dataset.shelfStep) * r.clientWidth * 0.9, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    const dot = ev.target.closest("[data-spot-go]");
    if (dot) {
      const spot = dot.closest("[data-spot]");
      const i = Number(dot.dataset.spotGo);
      spot.querySelectorAll(".spot-slide").forEach((s, j) => { s.hidden = i !== j; });
      spot.querySelectorAll("[data-spot-go]").forEach((d, j) => (j === i ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
    }
  });

  GS.shelves = { MIN, rotate, picks, spotlight, row, tabs };
})();

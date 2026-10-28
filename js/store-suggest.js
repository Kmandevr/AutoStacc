// Store autocomplete on a search box ([data-suggest] inside [data-browse]): as you type, GET /api/store/suggest offers
// the search itself, matching tags (genres, contents, formats... with how many products have them), creators and
// product titles, in an ARIA combobox (arrow keys, Enter, Escape). A tag, creator or search is handed to the store
// browser as a gs:suggest event on its [data-browse]; a product title opens its page. Needs js/util.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { escapeHTML: e, api } = GS;
  // The box may already sit in the header's search bar (js/site-search.js moves a page's own search box there).
  const browse = document.querySelector("[data-browse]");
  const input = browse && document.querySelector("[data-suggest]");
  if (!input) return;
  const list = document.createElement("ul");
  list.id = "store-suggestions";
  list.className = "suggest";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Suggestions");
  list.hidden = true;
  input.after(list);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("aria-expanded", "false");

  let options = [], active = -1, timer = null, seq = 0;
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; };
  function show(items) {
    options = items;
    active = -1;
    list.innerHTML = items.map((o, i) => `<li role="option" id="sg-${i}" aria-selected="false" data-i="${i}"><span class="sg-kind">${e(o.kind)}</span> ${e(o.text)}${o.count ? ` <span class="sg-count">${o.count}</span>` : ""}</li>`).join("");
    list.hidden = !items.length;
    input.setAttribute("aria-expanded", String(Boolean(items.length)));
  }
  function move(by) {
    if (list.hidden || !options.length) return;
    active = (active + by + options.length) % options.length;
    [...list.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
    input.setAttribute("aria-activedescendant", `sg-${active}`);
    list.children[active].scrollIntoView({ block: "nearest" });
  }
  function choose(o) {
    close();
    if (o.path) { location.href = o.path; return; }
    if (o.facet) input.value = "";
    browse.dispatchEvent(new CustomEvent("gs:suggest", { detail: o.facet ? { facet: o.facet, value: o.value } : o.creator ? { creator: o.creator } : { q: o.q } }));
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return close();
    timer = setTimeout(async () => {
      const mine = ++seq;
      const res = await api(`/api/store/suggest?q=${encodeURIComponent(q)}`);
      if (mine !== seq || !res.ok || input.value.trim() !== q) return;
      const d = res.data;
      show([{ kind: "Search", text: `“${q}”`, q },
        ...d.tags.map((t) => ({ kind: t.facetLabel, text: t.label, count: t.count, facet: t.facet, value: t.value })),
        ...d.makers.map((m) => ({ kind: "Creator", text: m.name, count: m.count, creator: m.id })),
        ...d.titles.map((t) => ({ kind: "Product", text: t.title, path: t.path }))]);
    }, 150);
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); if (list.hidden && options.length) { list.hidden = false; input.setAttribute("aria-expanded", "true"); } move(1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); move(-1); }
    else if (ev.key === "Escape" && !list.hidden) { ev.preventDefault(); close(); }
    else if (ev.key === "Enter" && !list.hidden && active >= 0) { ev.preventDefault(); choose(options[active]); }
  });
  list.addEventListener("mousedown", (ev) => ev.preventDefault()); // keep focus in the box while picking
  list.addEventListener("click", (ev) => { const li = ev.target.closest("[data-i]"); if (li) choose(options[Number(li.dataset.i)]); });
  input.addEventListener("blur", () => setTimeout(close, 100));
  input.form && input.form.addEventListener("submit", close);
})();

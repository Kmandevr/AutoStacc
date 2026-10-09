// Store filter templates (GS.storeFilters, for js/store-browse.js): the filter panel and the active-filter chips, drawn
// from a /api/store/search answer and the address's parameters. Templates only: no requests, no state. Every control
// has a stable id, so the page can keep focus where it was after a redraw. Needs js/util.js and data/product-types.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { escapeHTML: e, cents } = GS;
  const TYPES = window.PRODUCT_TYPES || {};
  const typeLabel = (t) => (TYPES[t] || {}).label || t;
  const values = (params, key) => (params.get(key) || "").split(",").filter(Boolean);
  const SHOW = 6; // values per group before "Show all"

  // A checkbox list: each value with its count; values with no matches stay visible only while selected.
  function group(id, title, items, { open = false, multi = true } = {}) {
    if (!items.length) return "";
    const selected = items.filter((x) => x.selected).length;
    const list = items.map((x, i) => `<li${i >= SHOW && !x.selected ? " data-more" : ""}><label for="f-${e(id)}-${e(x.value)}">
        <input type="checkbox" id="f-${e(id)}-${e(x.value)}" data-f="${e(id)}" data-v="${e(x.value)}"${x.selected ? " checked" : ""}${!x.count && !x.selected ? " disabled" : ""}${multi ? "" : ` data-single`}>
        <span>${e(x.label)}</span><span class="f-count">${x.count}</span></label></li>`).join("");
    return `<details class="f-group" id="g-${e(id)}"${open || selected ? " open" : ""}>
      <summary>${e(title)}${selected ? ` <span class="f-chosen">${selected}</span>` : ""}</summary>
      <ul class="f-list${items.length > SHOW ? " f-long" : ""}">${list}</ul>
      ${items.length > SHOW ? `<button type="button" class="f-more" data-more="${e(id)}" aria-expanded="false">Show all ${items.length}</button>` : ""}
    </details>`;
  }

  const money = (c) => (c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));

  // The whole panel. d: the search answer; params: URLSearchParams of the page's address.
  function panel(d, params) {
    const r = d.ranges || {};
    const free = params.get("free");
    const price = r.price && r.price.max !== null ? `<details class="f-group" id="g-price" open><summary>Price</summary>
      <div class="f-seg" role="radiogroup" aria-label="Free or paid">
        ${[["", "Any"], ["1", "Free"], ["0", "Paid"]].map(([v, t]) => `<label for="f-free-${v || "any"}"><input type="radio" name="free" id="f-free-${v || "any"}" data-free="${v}"${(free || "") === v ? " checked" : ""}> ${t}</label>`).join("")}
      </div>
      <form class="f-range" data-range="price">
        <label for="f-price-min">Min $<input id="f-price-min" name="min" inputmode="decimal" pattern="\\d{1,5}(\\.\\d{1,2})?" placeholder="${e(money(r.price.min))}" value="${e(money(params.get("price_min") && Number(params.get("price_min")) * 100))}"></label>
        <label for="f-price-max">Max $<input id="f-price-max" name="max" inputmode="decimal" pattern="\\d{1,5}(\\.\\d{1,2})?" placeholder="${e(money(r.price.max))}" value="${e(money(params.get("price_max") && Number(params.get("price_max")) * 100))}"></label>
        <button type="submit" class="btn ghost small">Apply</button>
      </form>
      <p class="f-hint small-print">Prices in the store now: ${e(cents(r.price.min || 0))} to ${e(cents(r.price.max || 0))}.</p>
    </details>` : "";
    const toggles = d.toggles || {};
    const flag = (key, text, n) => `<li><label for="f-${key}"><input type="checkbox" id="f-${key}" data-flag="${key}"${params.get(key) === "1" ? " checked" : ""}${!n && params.get(key) !== "1" ? " disabled" : ""}>
      <span>${text}</span><span class="f-count">${n || 0}</span></label></li>`;
    const deals = `<details class="f-group" id="g-deals" open><summary>Deals and new</summary><ul class="f-list">
      ${flag("sale", "On sale", toggles.sale)}${flag("new", "Added in the last 30 days", toggles.new)}</ul></details>`;
    const bpm = r.bpm && r.bpm.min !== null ? `<details class="f-group" id="g-bpm"${params.get("bpm_min") || params.get("bpm_max") ? " open" : ""}><summary>BPM</summary>
      <form class="f-range" data-range="bpm">
        <label for="f-bpm-min">From<input id="f-bpm-min" name="min" inputmode="numeric" pattern="\\d{1,3}" placeholder="${r.bpm.min}" value="${e(params.get("bpm_min") || "")}"></label>
        <label for="f-bpm-max">To<input id="f-bpm-max" name="max" inputmode="numeric" pattern="\\d{1,3}" placeholder="${r.bpm.max}" value="${e(params.get("bpm_max") || "")}"></label>
        <button type="submit" class="btn ghost small">Apply</button>
      </form><p class="f-hint small-print">Products without a stated tempo are left out while this is set.</p></details>` : "";
    const facets = (d.facets || []).map((g) => group(g.id, g.label, g.values, { open: ["genre", "contents"].includes(g.id), multi: true })).join("");
    const makers = group("creator", "Creator", (d.creators || []).map((c) => ({ ...c, label: c.label })));
    return `<h2 class="sr-only">Filters</h2>${price}${deals}${facets}${bpm}${makers}`;
  }

  // Active filters as removable chips: [{ key, value, text }]. d labels them (facet labels, creator names).
  function chips(d, params) {
    const out = [];
    const facetLabel = {};
    for (const g of d.facets || []) for (const v of g.values) facetLabel[`${g.id}:${v.value}`] = `${g.label}: ${v.label}`;
    const vocab = (window.VOCABULARY || {}).facets || {};
    for (const [key, raw] of params) {
      if (["sort", "page", "per"].includes(key)) continue;
      if (key === "q") { out.push({ key, value: raw, text: `“${raw}”` }); continue; }
      if (key === "category") { values(params, key).forEach((v) => out.push({ key, value: v, text: typeLabel(v) })); continue; }
      if (key === "creator") { values(params, key).forEach((v) => out.push({ key, value: v, text: `By ${((d.creators || []).find((c) => c.value === v) || {}).label || v}` })); continue; }
      if (vocab[key]) {
        values(params, key).forEach((v) => out.push({ key, value: v, text: facetLabel[`${key}:${v}`] || `${vocab[key].label}: ${(vocab[key].values || {})[v] || v}` }));
        continue;
      }
      const fixed = { price_min: `From $${raw}`, price_max: `Up to $${raw}`, bpm_min: `From ${raw} BPM`, bpm_max: `Up to ${raw} BPM`,
        free: raw === "1" ? "Free" : "Paid", sale: "On sale", new: "New this month" }[key];
      if (fixed) out.push({ key, value: raw, text: fixed });
    }
    return out;
  }

  const chipsHTML = (list) => list.map((c) => `<button type="button" class="chip" data-chip="${e(c.key)}" data-chip-value="${e(c.value)}">
      ${e(c.text)}<span aria-hidden="true"> ×</span><span class="sr-only"> (remove this filter)</span></button>`).join("");

  GS.storeFilters = { panel, chips, chipsHTML, typeLabel };
})();

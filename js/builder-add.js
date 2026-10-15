// The visual builder's Add tab (GS.builderAdd; docs/builder.md): every kind of element, grouped, to drop into the
// selected section (or the first one) at its first free spot; ready-made section layouts; and the four starter
// templates, which replace the page's whole draft after asking. Buttons carry data-action for js/builder.js.
// Needs js/util.js and js/builder-model.js.
(function () {
  "use strict";

  const { escapeHTML: e } = window.GS;
  const M = () => window.GS.builderModel;

  function palette(data, { profile }) {
    const groups = {};
    for (const [type, def] of Object.entries(M().ELEMENTS)) {
      if (!data.options.elements.includes(type)) continue;
      (groups[def.group] = groups[def.group] || []).push(`<button class="bx-tile" type="button" data-action="add-element" data-type="${e(type)}"><span class="bx-tile-icon bx-i-${e(type)}" aria-hidden="true"></span>${e(def.label)}</button>`);
    }
    const layouts = Object.entries(M().LAYOUTS).map(([id, l]) => `<button class="bx-tile" type="button" data-action="add-section" data-layout="${e(id)}"><span class="bx-tile-icon bx-l-${e(id)}" aria-hidden="true"></span>${e(l.label)}</button>`).join("");
    const templates = data.options.templates.map((t) => `<li><button class="bx-template" type="button" data-action="template" data-id="${e(t.id)}"><strong>${e(t.label)}</strong><span>${e(t.blurb)}</span></button></li>`).join("");
    return `<div class="bx-head"><h3>Add</h3></div>
      <p class="small-print">Elements go into the selected section at the first free spot. Drag them where you want them.</p>
      ${Object.entries(groups).map(([g, items]) => `<h4 class="bx-sub">${e(g)}</h4><div class="bx-tiles">${items.join("")}</div>`).join("")}
      <h4 class="bx-sub">Sections</h4><div class="bx-tiles">${layouts}</div>
      <h4 class="bx-sub">Start from a template</h4>
      <p class="small-print">Replaces this ${profile ? "profile" : "site"}'s draft (your files stay). Undo brings it back.</p>
      <ul class="bx-templates">${templates}</ul>`;
  }

  window.GS.builderAdd = { palette };
})();

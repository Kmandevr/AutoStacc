// Product Studio preview (GS.studioPreview, for js/studio-section-store.js and js/studio-section-release.js): turns the
// Studio's product record (GET /api/studio/products/:id) plus unsaved edits into the store API's product shape and draws
// it with the real product page's template (js/product-view.js) in preview mode: nothing can be bought or counted.
// Also counts the "Included content" summary from the product's files. Needs js/util.js, js/product-view.js and
// data/vocabulary.js.
(function () {
  "use strict";

  const { escapeHTML: e } = window.GS;

  // facets in the Studio are { facet: [value] }; the product page wants { facet: [{ label }] }.
  function labelled(facets = {}) {
    const V = (window.VOCABULARY || {}).facets || {};
    return Object.fromEntries(Object.entries(facets).map(([f, vs]) => [f, (vs || []).map((v) => ({ value: v, label: ((V[f] || {}).values || {})[v] || v }))]));
  }

  // over: unsaved edits { title, description, type, includes, tags, artwork, facets, bpm, specs }.
  function model(payload = {}, over = {}) {
    const p = { ...(payload.product || {}), ...over };
    const creator = payload.creator || {}, project = payload.project || {};
    return {
      id: p.id, title: p.title || "", type: p.type, description: p.description || "", artwork: p.artwork || null,
      priceCents: p.priceCents || 0, currency: p.currency || "USD", free: !p.priceCents, preview: p.preview || null,
      metadata: { includes: p.includes || [] }, tags: p.tags || [], facets: labelled(p.facets), bpm: p.bpm || null, specs: p.specs || {},
      creator: creator.name ? { name: creator.name, path: `/${creator.slug || ""}` } : null,
      projectName: project.name, projectPath: project.path, verified: creator.trusted === undefined ? undefined : Boolean(creator.trusted)
    };
  }

  function html(payload, over) {
    const m = model(payload, over);
    return `<div class="sp-preview-frame" aria-label="Preview of the product page" role="group">
      <p class="sp-preview-title">${e(m.title || "Untitled product")}</p>
      <div class="product-page">${window.GS.productView ? window.GS.productView.render(m, { preview: true }) : ""}</div></div>`;
  }

  // "Included content": files buyers get (single files and the Pac's), counted by format, with the total size.
  function included(files = [], packFiles = 0) {
    const live = files.filter((f) => f.status !== "rejected");
    if (!live.length && !packFiles) return '<p class="small-print">No files yet. Add them in the Pac Builder.</p>';
    const by = {};
    let total = 0;
    for (const f of live) {
      const ext = (String(f.filename || "").match(/\.([a-z0-9]{1,8})$/i) || [, "other"])[1].toUpperCase();
      by[ext] = (by[ext] || 0) + 1;
      total += f.sizeBytes || 0;
    }
    const K = window.GS.studioKit;
    return `<ul class="sk-counts">${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([x, n]) => `<li><strong>${n}</strong> ${e(x)}</li>`).join("")}
      ${packFiles ? `<li><strong>${Number(packFiles)}</strong> from the Pac</li>` : ""}</ul>
      ${live.length ? `<p class="small-print">${live.length} single file${live.length === 1 ? "" : "s"}, ${e(K.size(total))} in all.</p>` : ""}`;
  }

  window.GS.studioPreview = { model, html, included };
})();

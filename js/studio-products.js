// Studio products (GS.studioProducts, for js/studio.js): one project's product list on the Creator Dashboard
// (#products=<projectId>). Each card shows the cover, name, kind, price and status and opens the product in the Product
// Studio (#product=<id>&section=overview, js/studio-workspace.js). "New product" makes a draft from a name, kind and price
// and opens it at the Pac Builder, the main creation step. The server checks every field and limit
// (server/studio/products.js); prices come from it in cents. Needs js/util.js and data/product-types.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, cents, api } = window.GS;
  const KINDS = () => Object.entries(window.PRODUCT_TYPES || {});
  const status = (p) => (p.deleted ? "Removed" : p.published ? (p.salesPaused ? "Paused" : "On sale") : "Draft");
  const tone = (p) => (p.deleted ? "danger" : p.published ? (p.salesPaused ? "warn" : "good") : "neutral");
  const open = (id, section) => { location.hash = `product=${encodeURIComponent(id)}&section=${section}`; };

  function draw(root, data) {
    const card = (p) => `<li class="sp-card" data-id="${e(p.id)}">
        <div class="sp-cover">${p.artwork ? `<img src="${e(p.artwork)}" alt="" width="96" height="96" loading="lazy">` : '<span aria-hidden="true">No cover</span>'}</div>
        <div class="sp-info">
          <h3 class="sp-title">${e(p.title)}</h3>
          <p class="sp-meta">${e(((window.PRODUCT_TYPES || {})[p.type] || {}).label || p.type || "")} · ${p.priceCents ? e(cents(p.priceCents, p.currency || "USD")) : "Free"}</p>
          <span class="ws-status sp-status" data-tone="${tone(p)}">${status(p)}</span>
        </div>
        <a class="btn small" href="#product=${encodeURIComponent(p.id)}&amp;section=overview">Open<span class="sr-only"> ${e(p.title)}</span></a>
      </li>`;
    const room = data.limits.used < data.limits.products;
    root.innerHTML = `
      <div class="studio-bar"><button class="btn ghost" type="button" data-act="back">&larr; All projects</button><h2>Products</h2></div>
      <p class="small-print">${data.limits.used} of ${data.limits.products} products. Prices are free, or ${e(cents(data.limits.minPriceCents))} to ${e(cents(data.limits.maxPriceCents))}. New products start as drafts.${data.trusted ? "" : " Your files are checked by AutoStacc before buyers can get them."}</p>
      <ul class="sp-list">${data.products.map(card).join("") || '<li class="studio-empty">No products yet. Make your first one below: it opens in the Product Studio.</li>'}</ul>
      ${room ? `<form class="panel sp-new" data-form="new"><h3>New product</h3>
        <div class="sp-new-fields">
          <div class="field"><label for="sp-title">Name</label><input id="sp-title" name="title" required minlength="3" maxlength="80"></div>
          <div class="field"><label for="sp-type">Kind</label><select id="sp-type" name="type">${KINDS().map(([k, v]) => `<option value="${e(k)}">${e(v.label)}</option>`).join("")}</select></div>
          <div class="field"><label for="sp-price">Price in dollars (0 = free)</label><input id="sp-price" name="price" type="number" inputmode="decimal" min="0" max="${data.limits.maxPriceCents / 100}" step="0.01" required value="5.00"></div>
        </div>
        <button class="btn" type="submit">Create and add files</button><p class="msg" role="status"></p></form>` : ""}`;
  }

  function openList(root, projectId, onBack) {
    const base = `/api/studio/projects/${encodeURIComponent(projectId)}/products`;
    root.onchange = root.oninput = null;
    root.onclick = (ev) => { if (ev.target.closest("[data-act=back]")) onBack(); };
    root.onsubmit = async (ev) => {
      const f = ev.target.closest("form[data-form=new]");
      if (!f) return;
      ev.preventDefault();
      const btn = $("button[type=submit]", f);
      btn.disabled = true;
      const res = await api(base, { method: "POST", body: { title: f.title.value, type: f.type.value, priceCents: Math.round(Number(f.price.value) * 100) } });
      btn.disabled = false;
      if (!res.ok) return window.GS.say(f, res.error.message, true);
      open(res.data.product.id, "pacs");
    };
    const sk = window.GS.skeleton; // product rows as placeholders while the list loads (js/skeleton.js)
    if (sk) sk.show(root, "row", 4);
    (async () => {
      const res = await api(base);
      if (sk) sk.done(root);
      if (!res.ok) { root.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
      draw(root, res.data);
    })();
  }

  window.GS.studioProducts = { open: openList };
})();

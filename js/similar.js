// "You might also like" on a product's page ([data-similar="<product id>"]): products whose kind, contents, formats,
// genre and style are closest to this one (GET /api/store/similar/:id: no personal data, the same for everyone),
// varied across creators. Stays hidden when there are none or the store is offline. Needs js/util.js and
// js/product-card.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { escapeHTML: e, api } = GS;
  const root = document.querySelector("[data-similar]");
  if (!root || !GS.productCard) return;

  (async () => {
    // The product's page (/shop/<id>, server/shop/page.js) names the product.
    const id = root.dataset.similar || "";
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return;
    const res = await api(`/api/store/similar/${encodeURIComponent(id)}`);
    if (!res.ok || !res.data.products.length) return;
    root.innerHTML = `<div class="wrap"><div class="store-section-head"><h2 id="similar-head">You might also like</h2>
      <p class="small-print">Close in kind, contents, formats and style</p></div>
      <div class="store-row" aria-labelledby="similar-head">${res.data.products.map((p) => GS.productCard(p, { level: 3, wish: true, buy: false })).join("")}</div></div>`;
    root.hidden = false;
    dispatchEvent(new CustomEvent("gs:cards"));
  })();
})();

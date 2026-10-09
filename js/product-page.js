// Product page for creators' products (/product?p=<id>): fetches the product from the store API (the store, not this
// page, decides what exists and what it costs) and shows it with an Add to cart button. Products from data/products.js
// keep their own generated pages at /shop/<id>. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, cents, api, cart } = window.GS;
  const root = $("#product-app");
  if (!root) return;
  const id = new URLSearchParams(location.search).get("p") || "";
  const TYPES = window.PRODUCT_TYPES || {};

  const missing = () => { root.innerHTML = '<p class="msg error">That product isn\'t available. <a href="/shop">Back to the store</a></p>'; };

  async function load() {
    if (!/^[a-z0-9_-]{3,60}$/i.test(id)) return missing();
    const res = await api(`/api/products/${encodeURIComponent(id)}`);
    if (!res.ok) return missing();
    const p = res.data.product;
    const type = (TYPES[p.type] || {}).label || p.type;
    const includes = (p.metadata && p.metadata.includes) || [];
    document.title = `${p.title} · AutoStacc`;
    $("h1").textContent = p.title;
    root.innerHTML = `
      ${p.artwork ? `<img class="product-art" src="${e(p.artwork)}" alt="" width="480" height="480">` : ""}
      <div class="product-info">
        <p class="small-print">${e(type)}</p>
        <p class="product-price">${p.priceCents ? e(cents(p.priceCents, p.currency)) : "Free"}${p.sale ? ` <s class="small-print">${e(cents(p.listPriceCents, p.currency))}</s>` : ""}</p>
        ${p.description ? `<p class="product-desc">${e(p.description)}</p>` : ""}
        ${includes.length ? `<h2>What's inside</h2><ul>${includes.map((x) => `<li>${e(x)}</li>`).join("")}</ul>` : ""}
        ${p.available === false ? '<p class="msg">Not on sale right now.</p>' : '<button class="btn" type="button" data-buy>Add to cart</button>'}
        <p class="msg" role="status" hidden></p>
        <p class="small-print">By buying you accept the <a href="/terms">terms</a> and the <a href="/license">licence</a> for this kind of product. <a href="/refunds">Refunds</a>.</p>
      </div>`;
  }

  root.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-buy]");
    if (!btn) return;
    cart.add(id, 1);
    const msg = $(".msg", root);
    msg.hidden = false;
    msg.innerHTML = 'Added. <a href="/cart">Go to your cart</a>';
  });

  load();
})();

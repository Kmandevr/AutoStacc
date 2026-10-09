// Product page for creators' products (/product?p=<id>): fetches the product from the store API (the store, not this
// page, decides what exists and what it costs) and shows it with who made it, its preview clip and tags, and Add to cart,
// Get it free, or STACC'D when the visitor already has it. A creator AutoStacc hasn't verified is said so plainly.
// Products from data/products.js keep their own generated pages at /shop/<id>. Needs js/util.js.
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
    const [res, live] = await Promise.all([api(`/api/products/${encodeURIComponent(id)}`), api(`/api/products/state?ids=${encodeURIComponent(id)}`)]);
    if (!res.ok) return missing();
    const p = res.data.product;
    const owned = live.ok && live.data.products[id] && live.data.products[id].owned;
    const action = owned ? `<p><span class="owned-badge">STACC'D</span> <a class="btn ghost" href="/library">Open Your Stacc</a></p>`
      : p.available === false ? '<p class="msg">Not on sale right now.</p>'
      : p.free ? '<button class="btn" type="button" data-claim>Get it free</button>'
      : '<button class="btn" type="button" data-buy>Add to cart</button>';
    const type = (TYPES[p.type] || {}).label || p.type;
    const includes = (p.metadata && p.metadata.includes) || [];
    document.title = `${p.title} · AutoStacc`;
    $("h1").textContent = p.title;
    root.innerHTML = `
      ${p.artwork ? `<img class="product-art" src="${e(p.artwork)}" alt="" width="480" height="480">` : ""}
      <div class="product-info">
        <p class="small-print">${e(type)}${p.creator ? ` · by <a href="${e(p.projectPath || p.creator.path)}">${e(p.projectName || p.creator.name)}</a>` : ""}${p.verified === false ? ' <span class="tag unverified">Unverified creator</span>' : ""}</p>
        ${p.verified === false ? `<p class="msg unverified-note" role="note">AutoStacc hasn't verified this creator. Their files are checked for type, not for what's in them, so buy only from creators you trust. <a href="/refunds">Refunds</a> work as usual.</p>` : ""}
        ${p.preview ? `<figure class="preview"><figcaption>Preview</figcaption><audio controls preload="none" src="${e(p.preview)}" data-preview="${e(p.id)}"></audio></figure>` : ""}
        <p class="product-price">${p.priceCents ? e(cents(p.priceCents, p.currency)) : "Free"}${p.sale ? ` <s class="small-print">${e(cents(p.listPriceCents, p.currency))}</s>` : ""}</p>
        ${p.description ? `<p class="product-desc">${e(p.description)}</p>` : ""}
        ${includes.length ? `<h2>What's inside</h2><ul>${includes.map((x) => `<li>${e(x)}</li>`).join("")}</ul>` : ""}
        ${p.tags && p.tags.length ? `<p class="small-print">${p.tags.map((t) => `<span class="tag">${e(t)}</span>`).join(" ")}</p>` : ""}
        ${action}
        <p class="msg" role="status" hidden></p>
        <p class="small-print">By buying you accept the <a href="/terms">terms</a> and the <a href="/license">licence</a> for this kind of product. <a href="/refunds">Refunds</a>.</p>
      </div>`;
  }

  root.addEventListener("click", async (ev) => {
    const claim = ev.target.closest("[data-claim]");
    if (claim && !claim.disabled) {
      claim.disabled = true;
      const res = await api("/api/library/free", { method: "POST", body: { productId: id } });
      if (res.status === 401 || res.status === 403) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
      const msg = $(".msg[role=status]", root);
      msg.hidden = false;
      msg.innerHTML = res.ok ? 'Stacc\'d! <a href="/library">Open Your Stacc</a>' : e(res.error.message);
      if (!res.ok) claim.disabled = false; else claim.remove();
      return;
    }
    const btn = ev.target.closest("[data-buy]");
    if (!btn) return;
    cart.add(id, 1);
    const msg = $(".msg[role=status]", root);
    msg.hidden = false;
    msg.innerHTML = 'Added. <a href="/cart">Go to your cart</a>';
  });

  load();
})();

// Brings a product's page (/shop/<id>, drawn by the server in server/shop/page.js) to life: fetches the product and the
// visitor's state from the store API (the store, not this page, decides what exists and what it costs) and redraws it
// with its details, preview clip and Add to cart, Get it free, or STACC'D when the visitor already has it. A creator
// AutoStacc hasn't verified is said so plainly. The markup is js/product-view.js (shared with the Product Studio's
// preview). A page without a product (the server's 404) stays as it is. Get it free shows a spinner while it asks (js/skeleton.js, optional). Needs js/util.js and js/product-view.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api, cart } = window.GS, sk = window.GS.skeleton;
  const root = $("#product-app");
  if (!root) return;
  const id = root.dataset.product || "";
  if (!id) return;

  const missing = () => { root.innerHTML = '<p class="msg error">That product isn\'t available. <a href="/shop">Back to the store</a></p>'; };

  async function load() {
    if (!/^[a-z0-9_-]{3,60}$/i.test(id)) return missing();
    const [res, live] = await Promise.all([api(`/api/products/${encodeURIComponent(id)}`), api(`/api/products/state?ids=${encodeURIComponent(id)}`)]);
    if (!res.ok) return missing();
    const p = res.data.product;
    const owned = live.ok && live.data.products[id] && live.data.products[id].owned;
    document.title = `${p.title} · AutoStacc`;
    $("main h1").textContent = p.title;
    // The server drew the page first: a visitor may already have pressed a button on it. Keep their focus and what
    // the status line said (our own messages) across the redraw.
    const active = root.contains(document.activeElement) ? ["data-buy", "data-claim"].find((a) => document.activeElement.hasAttribute(a)) : null;
    const said = (($(".msg[role=status]", root) || {}).hidden === false) ? $(".msg[role=status]", root).innerHTML : "";
    root.innerHTML = window.GS.productView.render(p, { owned });
    const status = $(".msg[role=status]", root);
    if (said && status) { status.hidden = false; status.innerHTML = said; }
    const again = active && root.querySelector(`[${active}]`);
    if (again) again.focus();
    // Tell the store's on-device history (js/taste.js) and the wishlist hearts (js/wishlist.js) what's on the page.
    document.dispatchEvent(new CustomEvent("gs:taste", { detail: { t: "view", id: p.id } }));
    dispatchEvent(new CustomEvent("gs:cards"));
  }

  root.addEventListener("click", async (ev) => {
    const claim = ev.target.closest("[data-claim]");
    if (claim && !claim.disabled) {
      if (sk) sk.busy(claim, true); else claim.disabled = true;
      const res = await api("/api/library/free", { method: "POST", body: { productId: id } });
      if (res.status === 401 || res.status === 403) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
      const msg = $(".msg[role=status]", root);
      msg.hidden = false;
      msg.innerHTML = res.ok ? 'Stacc\'d! <a href="/library">Open Your Stacc</a>' : e(res.error.message);
      if (!res.ok) { if (sk) sk.busy(claim, false); else claim.disabled = false; } else claim.remove();
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

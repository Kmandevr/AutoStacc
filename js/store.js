// Store controls on product cards and product pages: live price, availability and ownership from the store API, and
// the Add to cart / Get it free / OWNED buttons. Needs js/util.js. Markup: an element with data-buy="<product id>"
// (its static content is the fallback when the API is unreachable), optional data-price and data-status="<product id>".
(function () {
  "use strict";

  const { escapeHTML, cents, api, cart, track } = window.GS;
  const sound = (name, el) => document.dispatchEvent(new CustomEvent("gs:sound", { detail: { name, el } }));
  const slots = () => [...document.querySelectorAll("[data-buy]")];
  if (!slots().length) return;

  // A polite live region so screen readers hear "Added to cart" without moving focus.
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  document.body.append(live);
  const say = (text) => { live.textContent = ""; setTimeout(() => (live.textContent = text), 50); };

  let state = null; // { signedIn, products: { id: { available, free, owned, priceCents, currency } } }

  function control(id) {
    const p = state && state.products[id];
    if (!p) return null; // unknown to the API (draft or API down): keep the static fallback
    if (p.owned) return `<span class="owned-badge" title="It's in your library">OWNED</span><a class="btn ghost" href="/library">Open library</a>`;
    if (!p.available) return `<span class="btn" aria-disabled="true">Unavailable</span>`;
    if (p.free) return `<button class="btn" type="button" data-claim="${escapeHTML(id)}">Get it free</button>`;
    if (cart.has(id)) return `<a class="btn ghost in-cart" href="/cart">In cart → checkout</a>`;
    return `<button class="btn" type="button" data-add-to-cart="${escapeHTML(id)}">Add to cart</button>`;
  }

  function paint() {
    for (const el of slots()) {
      const html = control(el.dataset.buy);
      if (html !== null && el.innerHTML !== html) el.innerHTML = html;
    }
    if (!state) return;
    document.querySelectorAll("[data-price]").forEach((el) => {
      const p = state.products[el.dataset.price];
      if (p) el.textContent = p.free ? "Free" : cents(p.priceCents, p.currency);
    });
    document.querySelectorAll("[data-status]").forEach((el) => {
      const p = state.products[el.dataset.status];
      if (p) el.textContent = p.owned ? "In your library" : p.available ? "Available now" : "Unavailable";
    });
  }

  async function load() {
    const ids = [...new Set(slots().map((el) => el.dataset.buy))];
    const res = await api(`/api/products/state?ids=${encodeURIComponent(ids.join(","))}`);
    if (res.ok) state = res.data;
    paint();
  }

  document.addEventListener("click", async (e) => {
    const add = e.target.closest("[data-add-to-cart]");
    if (add) {
      const id = add.dataset.addToCart;
      // Find the slot before the cart changes: the repaint replaces this button.
      const slot = add.closest("[data-buy]");
      cart.add(id);
      sound("stitch", add);
      track("add_to_cart", id);
      say("Added to cart.");
      paint();
      // Static fallback buttons (API down) still work: show the in-cart link anyway.
      if (slot && slot.contains(add)) slot.innerHTML = `<a class="btn ghost in-cart" href="/cart">In cart → checkout</a>`;
      const link = slot && slot.querySelector("a");
      if (link) { link.classList.add("stitched"); link.focus(); }
      return;
    }
    const claim = e.target.closest("[data-claim]");
    if (claim && !claim.disabled) {
      claim.disabled = true;
      claim.textContent = "Claiming…";
      const res = await api("/api/library/free", { method: "POST", body: { productId: claim.dataset.claim } });
      if (res.status === 401 || res.status === 403) {
        location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
        return;
      }
      if (res.ok) {
        state.products[claim.dataset.claim].owned = true;
        sound("cinch");
        say("Added to your library.");
      } else {
        sound("error");
        say(res.error.message);
      }
      claim.disabled = false;
      paint();
    }
  });

  addEventListener("gs:cart", paint);
  // js/shop.js redraws cards when a filter changes.
  addEventListener("gs:cards", paint);
  // Back/forward cache: the cart may have changed on another page.
  addEventListener("pageshow", (e) => e.persisted && paint());

  const page = document.querySelector("[data-product-page]");
  if (page) track("product_view", page.dataset.productPage);
  // Preview plays are counted once per page view.
  document.addEventListener("play", (e) => {
    const audio = e.target.closest && e.target.closest("audio[data-preview]");
    if (audio && !audio.dataset.counted) { audio.dataset.counted = "1"; track("preview_play", audio.dataset.preview); }
  }, true);

  load();
})();

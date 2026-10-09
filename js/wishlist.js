// Wishlist hearts on product cards and product pages ([data-wish="<product id>"]): reads the signed-in person's list
// once (GET /api/wishlist), shows which products are saved, and saves or removes one per press (PUT / DELETE). Signed
// out, a press asks to log in first and comes back. Tells js/taste.js (gs:taste) and other features (gs:wishlist on
// window, detail { ids }) when the list changes. Needs js/util.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { api, loginPath } = GS;
  // A polite live region so screen readers hear the change without moving focus.
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  document.body.append(live);
  const say = (text) => { live.textContent = ""; setTimeout(() => (live.textContent = text), 50); };
  let saved = null; // Set of product ids, or null while unknown / signed out
  let signedOut = false;

  const buttons = () => document.querySelectorAll("[data-wish]");
  function paint() {
    buttons().forEach((b) => {
      const on = Boolean(saved && saved.has(b.dataset.wish));
      b.setAttribute("aria-pressed", String(on));
      b.title = on ? "Saved to your wishlist (press to remove)" : "Save to your wishlist";
    });
  }
  const changed = () => { paint(); dispatchEvent(new CustomEvent("gs:wishlist", { detail: { ids: saved ? [...saved] : [] } })); };

  async function load() {
    const res = await api("/api/wishlist");
    if (res.status === 401) { signedOut = true; saved = null; return changed(); }
    if (res.ok) { saved = new Set(res.data.items.map((i) => i.productId)); changed(); }
  }

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-wish]");
    if (!b || b.disabled) return;
    e.preventDefault();
    if (signedOut) {
      location.href = loginPath(location.pathname + location.search);
      return;
    }
    if (!saved) return;
    const id = b.dataset.wish;
    const on = !saved.has(id);
    b.disabled = true;
    const res = await api(`/api/wishlist/${encodeURIComponent(id)}`, { method: on ? "PUT" : "DELETE", body: {} });
    b.disabled = false;
    if (res.status === 401) { signedOut = true; return; }
    if (!res.ok) { say(res.error.message); return; }
    on ? saved.add(id) : saved.delete(id);
    document.dispatchEvent(new CustomEvent("gs:taste", { detail: { t: on ? "wishlist" : "unwishlist", id } }));
    say(on ? "Saved to your wishlist." : "Removed from your wishlist.");
    changed();
  });
  addEventListener("gs:cards", paint);

  if (buttons().length || document.querySelector("[data-wishlist-view]")) load();
  else addEventListener("gs:cards", function once() { removeEventListener("gs:cards", once); load(); });
})();

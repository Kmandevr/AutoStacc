// The store's curated sections ([data-store-sections] on /shop): "Recommended for you", "Popular in your genres",
// "Bestselling", "Recently added", "Free and worth trying", deals and "Discover something different", from POST
// /api/store/recommendations with this browser's own history (js/taste.js profile; the server uses it and forgets it).
// Each product appears once across sections. Visitors can pick genres and kinds they make ("Tune your picks"), say
// "Not interested", forget their history or turn personal picks off. Saved products show as "Your wishlist" (live data
// from /api/products/state), and AutoStacc's placeholder products as "Coming soon". Hidden while the store browser
// is narrowed by a search or filter (gs:store-view). Needs js/util.js, js/product-card.js, js/taste.js, data/vocabulary.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { $, escapeHTML: e, api } = GS;
  const root = $("[data-store-sections]");
  if (!root || !GS.productCard || !GS.taste) return;
  const card = GS.productCard, taste = GS.taste;
  const VOCAB = (window.VOCABULARY || {}).facets || {};
  const TYPES = window.PRODUCT_TYPES || {};
  const PICK = [["genre", "Genres", Object.entries((VOCAB.genre || {}).values || {})],
    ["category", "Kinds of product", Object.entries(TYPES).filter(([k]) => k !== "other").map(([k, t]) => [k, t.label])]];
  let wished = [], data = null, hidden = false, seq = 0;

  const row = (id, title, reason, products, opts = {}) => `<section class="store-section" aria-labelledby="sec-${e(id)}" data-section="${e(id)}">
      <div class="store-section-head"><h2 id="sec-${e(id)}">${e(title)}</h2>${reason ? `<p class="small-print">${e(reason)}</p>` : ""}</div>
      <div class="store-row">${products.map((p) => card(p, { level: 3, why: p.why || "", dismissable: Boolean(opts.dismissable), wish: !p.draft })).join("")}</div></section>`;

  function controls() {
    const on = taste.enabled();
    const prefs = taste.prefs();
    const chosen = Object.values(prefs).flat().length;
    return `<div class="store-tune">
      <p class="store-tune-note">${on ? (data && data.personal ? "Picked from what you choose and do here. Your history stays in this browser." : "Tell the store what you make, or just browse: picks follow what you open, save and add.")
        : "Personal picks are off: everyone sees the same store."}</p>
      <div class="store-tune-actions">
        ${on ? `<button type="button" class="btn ghost small" data-tune aria-expanded="false" aria-controls="store-tune-panel">Tune your picks${chosen ? ` (${chosen})` : ""}</button>
          <button type="button" class="link-btn" data-forget>Forget my history</button>
          <button type="button" class="link-btn" data-personal="off">Turn off personal picks</button>`
        : `<button type="button" class="btn ghost small" data-personal="on">Turn on personal picks</button>`}
      </div>
      <div class="store-tune-panel" id="store-tune-panel" hidden>${PICK.map(([facet, title, values]) => `<fieldset><legend>${e(title)}</legend>
        ${values.map(([v, text]) => `<button type="button" class="chip${(prefs[facet] || []).includes(v) ? " on" : ""}" aria-pressed="${(prefs[facet] || []).includes(v)}" data-pref="${e(facet)}" data-v="${e(v)}">${e(text)}</button>`).join("")}
      </fieldset>`).join("")}<button type="button" class="btn small" data-tune-done>Show my picks</button></div>
    </div>`;
  }

  // Redraws keep focus on the same control in the same section (a wishlist heart, a preference chip...).
  function keepFocus(fn) {
    const a = document.activeElement;
    const sec = a && root.contains(a) && a.closest("[data-section]");
    const attr = a && ["wish", "addToCart", "personal", "tune"].find((k) => a.dataset && k in a.dataset);
    fn();
    if (!attr) return;
    const sel = `[data-${attr.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}${a.dataset[attr] ? `="${CSS.escape(a.dataset[attr])}"` : ""}]`;
    const again = (sec && root.querySelector(`[data-section="${sec.dataset.section}"] ${sel}`)) || root.querySelector(sel);
    if (again) again.focus({ preventScroll: true });
  }

  function draw() { keepFocus(paint); }
  function paint() {
    if (hidden) { root.hidden = true; return; }
    root.hidden = false;
    const secs = data ? data.sections : [];
    const personal = new Set(["for-you", "your-genres", "similar", "different"]);
    const soon = (window.PRODUCTS || []).filter((p) => p.draft);
    root.innerHTML = controls()
      + secs.map((s) => row(s.id, s.title, s.reason, s.products, { dismissable: personal.has(s.id) && taste.enabled() })).join("")
      + (wished.length ? row("wishlist", "Your wishlist", "Saved for later", wished) : "")
      + (soon.length ? row("soon", "Coming soon", "Announced by AutoStacc's projects; not on sale yet", soon) : "");
    dispatchEvent(new CustomEvent("gs:cards"));
    watch();
  }

  // Impressions: a product counts as shown once it is half on screen (once a day; js/taste.js keeps the policy).
  let observer = null;
  function watch() {
    if (!("IntersectionObserver" in window) || !taste.enabled()) return;
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        observer.unobserve(en.target);
        taste.record("impression", { id: en.target.dataset.product });
      }
    }, { threshold: 0.5 });
    root.querySelectorAll(".store-section:not([data-section=wishlist]):not([data-section=soon]) .card[data-product]").forEach((c) => observer.observe(c));
  }

  async function load() {
    const mine = ++seq;
    const res = await api("/api/store/recommendations", { method: "POST", body: taste.profile() });
    if (mine !== seq) return;
    data = res.ok ? res.data : { sections: [], personal: false };
    draw();
  }

  async function loadWishlist(ids) {
    if (!ids.length) { wished = []; return draw(); }
    const res = await api(`/api/products/state?ids=${encodeURIComponent(ids.slice(0, 50).join(","))}`);
    wished = res.ok ? ids.map((id) => res.data.products[id]).filter(Boolean) : [];
    draw();
  }

  root.addEventListener("click", (ev) => {
    const t = ev.target;
    const dismiss = t.closest("[data-dismiss]");
    if (dismiss) {
      taste.record("dismiss", { id: dismiss.dataset.dismiss });
      const c = dismiss.closest(".card");
      const next = c.nextElementSibling || c.previousElementSibling;
      c.remove();
      const to = next && next.querySelector(".card-body a[href]");
      if (to) to.focus();
      return;
    }
    if (t.closest("[data-tune]")) {
      const panel = $("#store-tune-panel", root), btn = t.closest("[data-tune]");
      panel.hidden = !panel.hidden;
      btn.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) panel.querySelector("button").focus();
      return;
    }
    const pref = t.closest("[data-pref]");
    if (pref) {
      const list = taste.prefs()[pref.dataset.pref] || [];
      const on = !list.includes(pref.dataset.v);
      taste.setPref(pref.dataset.pref, on ? [...list, pref.dataset.v] : list.filter((x) => x !== pref.dataset.v));
      pref.classList.toggle("on", on);
      pref.setAttribute("aria-pressed", String(on));
      return;
    }
    if (t.closest("[data-tune-done]")) { load(); return; }
    if (t.closest("[data-forget]")) { taste.reset(); load(); return; }
    const p = t.closest("[data-personal]");
    if (p) { taste.set(p.dataset.personal === "on"); load(); }
  });

  addEventListener("gs:store-view", (ev) => {
    const was = hidden;
    hidden = Boolean(ev.detail && ev.detail.narrowed);
    if (was !== hidden) draw();
  });
  addEventListener("gs:wishlist", (ev) => loadWishlist((ev.detail && ev.detail.ids) || []));
  load();
})();

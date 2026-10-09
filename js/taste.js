// The store's on-device history (GS.taste, for the store browser, its recommendation sections and product pages): a
// small event log kept only in this browser (localStorage "gs:taste:v2", never sent on its own), plus the genres and
// kinds the person picks. Recommendations send a summary of it with each request (POST /api/store/recommendations),
// which the server uses and forgets. One schema for every event: { t, id?, facet?, value?, q?, at }:
//   view (product page), click (opened from a list), preview (played a clip), cart (added), wishlist / unwishlist,
//   dismiss (not interested), search (submitted words), filter (picked a filter value), impression (shown in a section).
// Policy: events older than 90 days and beyond 400 entries are dropped; a view of the same product within 30 minutes,
// or an impression of the same product on the same day, is not counted again; purchases are never inferred here (the
// server knows confirmed purchases). Off = nothing recorded, everything forgotten. Needs js/util.js.
(function () {
  "use strict";

  const GS = window.GS;
  const KEY = "gs:taste:v2", OFF = "gs:taste-off", OLD = "gs:taste";
  const KEEP_MS = 90 * 86400000, MAX = 400, VIEW_GAP = 30 * 60000;
  const TYPES = ["view", "click", "preview", "cart", "wishlist", "unwishlist", "dismiss", "search", "filter", "impression"];
  const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
  const write = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
  const blank = () => ({ v: 2, events: [], prefs: {}, seed: Math.random().toString(36).slice(2, 10) });
  const enabled = () => !read(OFF, false);
  let data = Object.assign(blank(), read(KEY, {}));
  write(OLD, null); // the first version's record (gs:taste) is retired

  function prune(now = Date.now()) {
    data.events = data.events.filter((e) => now - e.at < KEEP_MS).slice(-MAX);
  }
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);

  // Adds one event under the policy above. Returns whether it was kept.
  function record(t, fields = {}) {
    if (!enabled() || !TYPES.includes(t)) return false;
    const at = Date.now();
    const same = (e) => e.t === t && e.id === fields.id;
    if (t === "view" && data.events.some((e) => same(e) && at - e.at < VIEW_GAP)) return false;
    if (t === "impression" && data.events.some((e) => same(e) && day(e.at) === day(at))) return false;
    const e = { t, at };
    for (const k of ["id", "facet", "value"]) if (typeof fields[k] === "string" && fields[k]) e[k] = fields[k].slice(0, 80);
    if (typeof fields.q === "string" && fields.q.trim()) e.q = fields.q.trim().slice(0, 100);
    data.events.push(e);
    prune(at);
    write(KEY, data);
    return true;
  }

  const prefs = () => ({ ...(data.prefs || {}) });
  function setPref(facet, values) {
    if (!enabled()) return;
    data.prefs = { ...data.prefs, [facet]: [...new Set(values)].slice(0, 12) };
    if (!data.prefs[facet].length) delete data.prefs[facet];
    write(KEY, data);
  }

  // The summary a recommendation request carries: counts per product and kind, filters used, recent searches, what was
  // dismissed, what was shown without being opened (so it can rotate out), the cart (never recommended back).
  function profile(extra = {}) {
    const cart = GS.cart ? GS.cart.items().map((i) => i.productId) : [];
    if (!enabled()) return { personalize: false, cart, ...extra };
    prune();
    const counts = {}, filters = {}, searches = [], dismissed = new Set(), shown = {}, opened = new Set(), wished = new Set();
    for (const e of data.events) {
      if (["view", "click", "preview", "cart"].includes(e.t)) { const k = `${e.id}|${e.t}`; counts[k] = (counts[k] || 0) + 1; opened.add(e.id); }
      if (e.t === "wishlist") wished.add(e.id);
      if (e.t === "unwishlist") wished.delete(e.id);
      if (e.t === "filter") ((filters[e.facet] ||= {})[e.value] = (filters[e.facet][e.value] || 0) + 1);
      if (e.t === "search") searches.push(e.q);
      if (e.t === "dismiss") dismissed.add(e.id);
      if (e.t === "impression") shown[e.id] = (shown[e.id] || 0) + 1;
    }
    for (const id of opened) delete shown[id];
    const interactions = Object.entries(counts).map(([k, n]) => { const [id, kind] = k.split("|"); return { id, kind, n }; })
      .concat([...wished].map((id) => ({ id, kind: "wishlist", n: 1 })))
      .sort((a, b) => b.n - a.n).slice(0, 60);
    return { personalize: true, prefs: prefs(), interactions, filters, searches: [...new Set(searches.reverse())].slice(0, 5),
      dismissed: [...dismissed].slice(-200), shown, seed: data.seed, cart, ...extra };
  }

  const signals = () => data.events.filter((e) => e.t !== "impression").length + Object.keys(data.prefs || {}).length;
  function set(on) { write(OFF, on ? null : true); if (!on) reset(); }
  function reset() { data = blank(); write(KEY, null); }

  // Recording from the page itself: product pages, opening from lists, Add to cart, preview plays, and the store's
  // own events (gs:taste on document: { t, id, facet, value, q }).
  const page = document.querySelector("[data-product-page]");
  if (page) record("view", { id: page.dataset.productPage });
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-to-cart]");
    if (add) return record("cart", { id: add.dataset.addToCart });
    const open = e.target.closest(".card a[href]:not([data-wish]):not([data-dismiss])");
    const card = open && open.closest("[data-product]");
    if (card) record("click", { id: card.dataset.product });
  });
  document.addEventListener("play", (e) => {
    const a = e.target.closest && e.target.closest("audio[data-preview]");
    if (a) record("preview", { id: a.dataset.preview });
  }, true);
  document.addEventListener("gs:taste", (e) => { if (e.detail && e.detail.t) record(e.detail.t, e.detail); });

  GS.taste = { record, profile, prefs, setPref, enabled, set, reset, signals };
})();

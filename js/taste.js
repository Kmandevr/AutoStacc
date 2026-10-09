// Personal picks for the store (GS.taste, for js/shop.js): a small preference model kept only in this browser
// (localStorage "gs:taste", never sent anywhere). It counts which products you open and add to your cart and which type
// filters you use, then ranks the catalog by how close each item is to those (same type, project, tags, formats). Picks
// skip what's in your cart and always keep one place for something from a kind you haven't looked at yet, so the row
// doesn't only repeat your habits. Switch off or reset from the store. Records on any page that loads it. Needs js/util.js.
(function () {
  "use strict";

  const GS = window.GS;
  const KEY = "gs:taste";
  const OFF = "gs:taste-off";
  const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
  const write = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
  const blank = () => ({ views: {}, adds: {}, types: {} });
  let data = Object.assign(blank(), read(KEY, {}));
  const enabled = () => !read(OFF, false);
  // Keeps the record small: at most 60 ids per kind, the least-used dropped first.
  const bump = (map, key, by = 1) => {
    map[key] = (map[key] || 0) + by;
    const keys = Object.keys(map);
    if (keys.length > 60) delete map[keys.sort((a, b) => map[a] - map[b])[0]];
  };
  const save = () => write(KEY, data);
  function record(kind, key) {
    if (!enabled() || !key) return;
    bump(data[kind], key);
    save();
  }

  const signals = () => Object.values(data.views).reduce((a, b) => a + b, 0) + Object.values(data.adds).reduce((a, b) => a + b, 0)
    + Object.values(data.types).reduce((a, b) => a + b, 0);
  const labels = (p) => [...(p.tags || []), ...(p.formats || [])].map((x) => String(x).toLowerCase());
  // Same kind matters most; shared tags and formats next; the same project only a little (most catalogs are one project).
  const similar = (p, q) => (p.type === q.type ? 3 : 0) + (p.project === q.project ? 0.5 : 0) + labels(p).filter((x) => labels(q).includes(x)).length;

  // Each item with its score and the item it's closest to (for "Because you looked at …").
  function score(products, typeLabel) {
    const seen = products.map((q) => ({ q, w: (data.views[q.id] || 0) + 3 * (data.adds[q.id] || 0) })).filter((x) => x.w);
    return products.map((p) => {
      let best = null, total = 2 * (data.types[typeLabel(p)] || 0);
      for (const { q, w } of seen) {
        if (q === p) continue;
        const sim = similar(p, q);
        total += sim * w;
        // Only a real likeness (same kind, tag or format) is worth naming as the reason.
        if (sim >= 1 && (!best || sim * w > best.s)) best = { s: sim * w, q };
      }
      // Something opened often but never bought is still interesting, but less than something new to you.
      total += Math.min(data.views[p.id] || 0, 2);
      return { p, score: total, because: best && best.q };
    });
  }

  // n picks: things you haven't opened yet that are closest to what you have, then one from a kind you haven't shown
  // interest in. Items you've already seen fill in only when there's nothing new left. Empty without enough history.
  function picks(products, n, { typeLabel, skip = () => false }) {
    if (!enabled() || signals() < 2) return [];
    const seen = (p) => Boolean(data.views[p.id] || data.adds[p.id]);
    const liked = new Set([...products.filter(seen).map(typeLabel), ...Object.keys(data.types)]);
    const pool = score(products.filter((p) => !skip(p)), typeLabel).sort((a, b) => b.score - a.score);
    const fresh = pool.filter((x) => !seen(x.p));
    const close = fresh.filter((x) => liked.has(typeLabel(x.p)) || x.because).slice(0, Math.max(n - 1, 1))
      .map((x) => ({ ...x, reason: x.because ? `Because you looked at ${x.because.title}` : `More ${typeLabel(x.p)}` }));
    const other = fresh.find((x) => !liked.has(typeLabel(x.p)) && !close.includes(x));
    const out = [...close, ...(other ? [{ ...other, reason: "Something different to try" }] : [])];
    for (const x of [...fresh, ...pool]) {
      if (out.length >= n) break;
      if (!out.some((o) => o.p === x.p)) out.push({ ...x, reason: seen(x.p) ? "You looked at this" : "New to you" });
    }
    return out.slice(0, n);
  }

  // The whole catalog in recommended order (stable for items with the same score).
  const rank = (products, typeLabel) => (enabled() && signals() >= 2
    ? score(products, typeLabel).map((x, i) => ({ ...x, i })).sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.p)
    : products);

  function set(on) { write(OFF, on ? null : true); if (!on) reset(); }
  function reset() { data = blank(); write(KEY, null); }

  // Recording: product pages count a view; any Add to cart counts an add; type filters count the type picked.
  const page = document.querySelector("[data-product-page]");
  if (page) record("views", page.dataset.productPage);
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-to-cart]");
    if (add) return record("adds", add.dataset.addToCart);
    const pick = e.target.closest("[data-select]");
    if (pick) return record("views", pick.dataset.select);
    const type = e.target.closest("[data-filter=type] button");
    if (type && type.dataset.value) record("types", type.dataset.value);
  });

  GS.taste = { picks, rank, record, enabled, set, reset, signals };
})();

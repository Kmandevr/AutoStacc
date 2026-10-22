// AutoStacc preview cards under posts (the cards feature, server/community/features/cards/; needs nothing else). Each
// link the formatter marked (data-cm-card) is looked up once; if the store knows that address, a card is drawn from the
// answer with textContent only. Links with no card stay as they are. Does nothing when the feature is off.
(function () {
  "use strict";
  const links = [...document.querySelectorAll("a[data-cm-card]")];
  if (!links.length) return;
  const seen = new Map();
  const ask = (path) => {
    if (!seen.has(path)) seen.set(path, fetch(`/api/community/cards?path=${encodeURIComponent(path)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null)).then((b) => (b && b.card) || null).catch(() => null));
    return seen.get(path);
  };
  const make = (c) => {
    const a = document.createElement("a");
    a.className = `cm-card cm-card-${c.kind}`;
    a.href = c.path;
    if (c.image) { const img = document.createElement("img"); img.src = c.image; img.alt = ""; img.loading = "lazy"; a.append(img); }
    const body = document.createElement("span");
    const t = document.createElement("strong");
    t.textContent = c.title;
    const d = document.createElement("span");
    d.textContent = c.detail;
    body.append(t, d);
    a.append(body);
    return a;
  };
  links.forEach(async (link) => {
    const c = await ask(link.dataset.cmCard);
    if (!c) return;
    const holder = link.closest("p, li, blockquote") || link;
    if (holder.nextElementSibling && holder.nextElementSibling.matches(`a.cm-card[href="${CSS.escape(c.path)}"]`)) return;
    holder.after(make(c));
  });
})();

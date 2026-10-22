// Community search (the search feature, server/community/features/search/; needs js/community-kit.js): a search box at
// the top of the community pages; results list inline below it, text only through textContent, with "more" paging.
// Does nothing when the feature is off.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit) return;
  const { el, status, say } = kit;
  const api = window.GS.api;

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("search")) return;
    const main = document.querySelector("main");
    if (!main) return;
    const q = el("input", { type: "search", name: "q", maxlength: 100, "aria-label": "Search the community", placeholder: "Search takes" });
    const msg = status();
    const out = el("div", { class: "cm-results", "aria-live": "polite" });
    let page = 1;
    const run = async (more) => {
      if (!more) { page = 1; out.replaceChildren(); }
      const r = await api(`/api/community/search?q=${encodeURIComponent(q.value)}&page=${page}`);
      if (!r.ok) return say(msg, r.error.message);
      say(msg, "");
      if (!r.data.results.length && !more) out.append(el("p", { class: "cm-small", text: "Nothing found. Try fewer or different words." }));
      r.data.results.forEach((x) => out.append(el("p", { class: "cm-small" }, el("a", { href: x.path, text: x.title }), ` · ${x.space} · ${x.replies} ${x.replies === 1 ? "reply" : "replies"}`)));
      const old = out.querySelector(".cm-more");
      if (old) old.remove();
      if (r.data.more) out.append(el("button", { class: "btn ghost small cm-more", type: "button", text: "More results", on: { click: () => { page += 1; run(true); } } }));
    };
    const form = el("form", { class: "cm-search", role: "search", on: { submit: (ev) => { ev.preventDefault(); if (q.value.trim()) run(false); } } },
      q, el("button", { class: "btn small", type: "submit", text: "Search" }), msg);
    main.prepend(el("div", { class: "cm-find" }, form, out));
  })();
})();

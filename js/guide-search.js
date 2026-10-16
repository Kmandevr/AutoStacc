// Search on /guide and /help: filters the guides and help answers (data/guide-index.js, generated from data/guides.js
// and data/help.js) as you type. Every word must appear in an entry's title or text; titles rank first. The form stays
// hidden without JavaScript or without the index, so nothing half-works.
(function () {
  "use strict";
  const form = document.querySelector("[data-guide-search]");
  const index = window.GUIDE_INDEX;
  if (!form || !Array.isArray(index)) return;
  const input = form.querySelector("input");
  const list = form.querySelector(".guide-results");
  const norm = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const entries = index.map((e) => ({ ...e, title: norm(e.t), text: norm(e.x) }));

  function show(q) {
    list.textContent = "";
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const hits = entries.filter((e) => words.every((w) => e.title.includes(w) || e.text.includes(w)))
      .map((e) => ({ e, score: words.filter((w) => e.title.includes(w)).length }))
      .sort((a, b) => b.score - a.score).slice(0, 8);
    if (!hits.length) {
      const li = document.createElement("li");
      li.className = "guide-empty";
      li.textContent = "Nothing found. Try another word, or contact support.";
      list.append(li);
      return;
    }
    for (const { e } of hits) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = e.p;
      const strong = document.createElement("strong");
      strong.textContent = e.t;
      const where = document.createElement("span");
      where.textContent = e.s;
      a.append(strong, where);
      li.append(a);
      list.append(li);
    }
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const first = list.querySelector("a");
    if (first) location.href = first.href;
  });
  input.addEventListener("input", () => show(input.value));
  form.hidden = false;
})();

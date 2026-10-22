// Similar questions while typing (the similar feature, server/community/features/similar/; needs js/community-kit.js):
// under the title of a new take, the questions that already share its words, once the visitor pauses. Text only
// through textContent. Does nothing when the feature is off.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit) return;
  const { el } = kit;
  const api = window.GS.api;

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("similar")) return;
    let timer = null;
    let box = null;
    document.addEventListener("input", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement) || t.name !== "title" || !t.closest(".cm-form")) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (t.value.trim().length < 8) { if (box) box.remove(); box = null; return; }
        const r = await api(`/api/community/similar?title=${encodeURIComponent(t.value)}`);
        if (box) box.remove();
        box = null;
        if (!r.ok || !r.data.similar.length) return;
        box = el("div", { class: "cm-similar", role: "status" }, el("p", { class: "cm-small", text: "Already asked? These might help:" }),
          r.data.similar.map((x) => el("p", { class: "cm-small" }, el("a", { href: x.path, text: x.title }), x.answered ? " · answered" : ` · ${x.replies} ${x.replies === 1 ? "reply" : "replies"}`)));
        t.closest("label").after(box);
      }, 400);
    });
  })();
})();

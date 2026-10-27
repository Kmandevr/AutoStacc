// Studio "Needs you" (GS.studioAttention, drawn by js/studio.js; owner, 2026-10-27, #221): one creator's products that
// wait on someone (drafts, Coming soon, files and Pac versions waiting or refused), from GET
// /api/studio/creators/:id/attention, each linking to the Product Studio section that fixes it. "All clear" when
// nothing waits; nothing at all for members who don't run products (the API answers 404). Needs js/util.js.
(function () {
  "use strict";
  const { escapeHTML: e, api } = window.GS;
  const SAY = {
    draft: () => "Draft, not on sale yet",
    coming_soon: (x) => `Coming soon, on sale ${x.on}`,
    file_review: (x) => `${x.count} file${x.count === 1 ? "" : "s"} waiting for AutoStacc's check`,
    file_refused: (x) => `${x.count} file${x.count === 1 ? "" : "s"} refused: replace ${x.count === 1 ? "it" : "them"}`,
    version_ready: () => "Pac version checked: publish it",
    version_in_review: () => "Pac version waiting for AutoStacc's review",
    version_failed: () => "Pac version failed its checks: upload again"
  };
  // What needs the creator first, then what only needs patience.
  const ORDER = ["file_refused", "version_failed", "version_ready", "draft", "coming_soon", "file_review", "version_in_review"];

  window.GS.studioAttention = {
    async draw(el, creatorId) {
      if (window.GS.skeleton) window.GS.skeleton.show(el, "line", 2);
      const r = await api(`/api/studio/creators/${encodeURIComponent(creatorId)}/attention`);
      if (window.GS.skeleton) window.GS.skeleton.done(el);
      if (!r.ok) { el.remove(); return; }
      const items = r.data.items.slice().sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
      el.innerHTML = `<h3 class="studio-sub">Needs you${items.length ? ` <span class="studio-count">${items.length}</span>` : ""}</h3>
        ${items.length ? `<ul class="studio-attention-list">${items.map((x) => `<li data-kind="${e(x.kind)}">
            <a href="${e(x.href)}"><strong>${e(x.title)}</strong></a> <span>${e((SAY[x.kind] || (() => ""))(x))}</span>${x.project ? ` <small>${e(x.project)}</small>` : ""}</li>`).join("")}</ul>`
          : '<p class="small-print">All clear: nothing in your products is waiting on you.</p>'}`;
    }
  };
})();

// Product Studio, Release (GS.studioSections.release, drawn by js/studio-workspace.js): the readiness lists, the final
// preview (the product page's own template, js/studio-preview.js), the controls (Publish, Back to draft, Pause, Resume,
// Remove: ctx.release, which the server refuses with the blocking list while something blocks), and the release history
// from GET /api/studio/products/:id/activity?limit=50. Rollback isn't available yet. Needs js/util.js and js/studio-kit.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const sections = (window.GS.studioSections = window.GS.studioSections || {});

  sections.release = {
    draw(el, ctx) {
      const K = window.GS.studioKit, P = window.GS.studioPreview;
      const data = ctx.product, p = data.product || {}, st = K.status(p);
      const blocked = ((data.readiness || {}).blocking || []).length > 0;
      const btn = (act, label, primary) => `<button class="btn small${primary ? "" : " ghost"}${act === "remove" ? " danger" : ""}" type="button" data-sw-release="${act}">${label}</button>`;
      const controls = p.deleted ? [btn("restore", "Restore")]
        : p.published ? [p.salesPaused ? btn("resume", "Resume sales", true) : btn("pause", "Pause sales"), btn("draft", "Back to draft"), btn("remove", "Remove")]
        : [btn("publish", "Publish", true), btn("remove", "Remove")];
      el.innerHTML = `
        <div class="sr-state"><span class="ws-status" data-tone="${st.tone}">${st.text}</span>
          <p class="small-print">${p.deleted ? "Removed: buyers who have it keep their files."
            : p.published ? (p.salesPaused ? "Visible, but nobody can buy it until you resume sales." : "On sale. Saved edits are live as soon as they're saved.")
            : blocked ? "A draft. Fix what's listed below, then publish." : "A draft, ready to publish."}</p></div>
        ${K.readiness(data.readiness)}
        <div class="sr-controls">${controls.join("")}</div>
        <h3>Final preview</h3>
        ${P ? P.html(data) : ""}
        <h3>Release history</h3>
        <div data-sr-history><p class="msg pending">Loading…</p></div>
        <p class="small-print">Rollback isn't available yet. A replaced Pac version can't be restored: upload it again.</p>`;
      (async () => {
        const res = await api(`/api/studio/products/${encodeURIComponent(p.id)}/activity?limit=50`);
        const box = $("[data-sr-history]", el);
        if (!box || !el.isConnected) return;
        box.innerHTML = res.ok ? K.activity(res.data.activity || []) : K.activity(data.activity || []);
      })();
    }
  };
})();

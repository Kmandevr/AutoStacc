// Product Studio, Overview (GS.studioSections.overview, drawn by js/studio-workspace.js): cover, name, project and
// status; the readiness checklist (blocking first), quick actions, the last 10 release-history events as sentences,
// and the 30-day summary with a link to Insights. Only shows what GET /api/studio/products/:id said.
// Needs js/util.js and js/studio-kit.js.
(function () {
  "use strict";

  const { escapeHTML: e, cents } = window.GS;
  const sections = (window.GS.studioSections = window.GS.studioSections || {});

  sections.overview = {
    draw(el, ctx) {
      const K = window.GS.studioKit;
      const data = ctx.product, p = data.product || {}, st = K.status(p);
      const sum = data.summary || null;
      const money = (c) => (typeof c === "number" ? cents(c, p.currency || "USD") : "—");
      const tiles = sum ? [["Orders", sum.orders ?? 0], ["Units", sum.units ?? 0], ["Net revenue", money(sum.netCents)],
        ...(sum.creatorShareCents === null || sum.creatorShareCents === undefined ? [] : [["Your share", money(sum.creatorShareCents)]]),
        ["Downloads", sum.downloads ?? 0], ["Views", sum.views ?? 0]] : [];
      el.innerHTML = `
        <div class="so-head">
          <div class="so-cover">${p.artwork ? `<img src="${e(p.artwork)}" alt="Cover art for ${e(p.title || "this product")}" width="120" height="120">` : '<span aria-hidden="true">No cover yet</span>'}</div>
          <div class="so-facts">
            <p class="so-name">${e(p.title || "Untitled product")}</p>
            <p class="small-print">${data.project ? `In ${data.project.path ? `<a href="${e(data.project.path)}" target="_blank" rel="noopener">${e(data.project.name)}<span class="sr-only"> (opens in a new tab)</span></a>` : e(data.project.name)}` : ""}</p>
            <span class="ws-status" data-tone="${st.tone}">${st.text}</span>
          </div>
        </div>
        <h3>Readiness</h3>
        ${K.checkout(data.checkout)}${K.readiness(data.readiness)}
        <h3>Quick actions</h3>
        <div class="so-actions">
          <button class="btn ghost small" type="button" data-sw-go="pacs">Edit Pac</button>
          <button class="btn ghost small" type="button" data-sw-go="store">Edit store page</button>
          <button class="btn ghost small" type="button" data-sw-go="pricing">Set price</button>
          ${p.published && !p.deleted && p.path ? `<a class="btn ghost small" href="${e(p.path)}" target="_blank" rel="noopener">Preview<span class="sr-only"> (opens in a new tab)</span></a>`
            : '<button class="btn ghost small" type="button" data-sw-go="store">Preview</button>'}
          ${!p.published && !p.deleted ? '<button class="btn small" type="button" data-sw-release="publish">Publish</button>' : ""}
        </div>
        <div class="so-cols">
          <div><h3>Recent activity</h3>${K.activity((data.activity || []).slice(0, 10))}</div>
          <div><h3>Last ${sum && sum.days ? sum.days : 30} days</h3>
            ${tiles.length ? `<ul class="sk-tiles">${tiles.map(([k, v]) => `<li><span>${e(k)}</span><strong>${e(String(v))}</strong></li>`).join("")}</ul>` : '<p class="small-print">No figures yet.</p>'}
            <button class="link-btn" type="button" data-sw-go="insights">See all insights</button></div>
        </div>`;
    }
  };
})();

// Product Studio, Insights (GS.studioSections.insights, drawn by js/studio-workspace.js): this product's last 30, 90 or
// 365 days from GET /api/studio/products/:id/insights?days=: figure tiles with the change against the period before, a
// daily bar chart (one hue, a hover readout, a table for screen readers and anyone who prefers numbers), sales
// performance, the CSV export, and traffic sources said plainly to be not tracked yet. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, cents, api } = window.GS;
  const sections = (window.GS.studioSections = window.GS.studioSections || {});
  const METRICS = { netCents: "Net revenue", orders: "Orders", downloads: "Downloads", views: "Views" };

  sections.insights = {
    draw(el, ctx) {
      const p = ctx.product.product || {};
      const base = `/api/studio/products/${encodeURIComponent(p.id)}/insights`;
      const money = (c) => cents(c || 0, p.currency || "USD");
      let days = 30, metric = "netCents", data = null;

      const fmt = (k, v) => (v === null || v === undefined ? "—" : /Cents$/.test(k) ? money(v) : k === "conversion" ? `${(v * 100).toFixed(1)}%` : Number(v).toLocaleString("en-US"));
      function change(k, now, before) {
        if (now === null || now === undefined || before === null || before === undefined) return "";
        if (!before) return now ? "New this period" : "No change";
        const pct = ((now - before) / Math.abs(before)) * 100;
        return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(0)}% vs the ${days} days before`;
      }

      function chart(rows) {
        const max = Math.max(0, ...rows.map((r) => r[metric] || 0));
        const total = rows.reduce((n, r) => n + (r[metric] || 0), 0);
        return `<figure class="si-chart">
          <figcaption><strong>${e(METRICS[metric])} per day</strong> <span class="small-print">${e(fmt(metric, total))} in ${rows.length} days</span></figcaption>
          <div class="si-plot" data-dense="${rows.length > 120}">
            <span class="si-max small-print" aria-hidden="true">${e(fmt(metric, max))}</span>
            <div class="si-bars" role="img" aria-label="${e(`${METRICS[metric]} per day, ${rows[0] ? rows[0].date : ""} to ${rows.length ? rows[rows.length - 1].date : ""}; highest ${fmt(metric, max)}. The table below has every day.`)}">
              ${rows.map((r, i) => `<span class="si-bar" data-i="${i}" style="--h:${max ? ((r[metric] || 0) / max) * 100 : 0}%"></span>`).join("")}</div>
            <div class="si-tip" hidden></div>
          </div>
          <div class="si-axis small-print" aria-hidden="true"><span>${e(rows[0] ? rows[0].date : "")}</span><span>${e(rows.length ? rows[rows.length - 1].date : "")}</span></div>
          <details><summary>Show as a table</summary><div class="sk-table"><table><thead><tr><th scope="col">Day</th>${Object.values(METRICS).map((m) => `<th scope="col">${e(m)}</th>`).join("")}</tr></thead>
            <tbody>${rows.map((r) => `<tr><th scope="row">${e(r.date)}</th>${Object.keys(METRICS).map((k) => `<td>${e(fmt(k, r[k]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>
        </figure>`;
      }

      function draw() {
        const t = data.totals || {}, prev = data.previous || {};
        const tiles = [["orders", "Orders"], ["units", "Units"], ["grossCents", "Gross revenue"], ["discountCents", "Discounts"], ["netCents", "Net revenue"],
          ["platformFeeCents", "Platform fees"], ["creatorShareCents", "Your share"], ["refundedCents", "Refunds"], ["freeClaims", "Free claims"],
          ["downloads", "Downloads"], ["views", "Page views"], ["conversion", "Conversion"]].filter(([k]) => t[k] !== null && t[k] !== undefined);
        $("[data-si-body]", el).innerHTML = `
          <ul class="sk-tiles">${tiles.map(([k, l]) => `<li><span>${e(l)}</span><strong>${e(fmt(k, t[k]))}</strong><small>${e(change(k, t[k], prev[k]))}</small></li>`).join("")}</ul>
          <div class="field si-metric"><label for="si-metric">Chart</label><select id="si-metric" data-si-metric>${Object.entries(METRICS).map(([k, l]) => `<option value="${k}"${k === metric ? " selected" : ""}>${e(l)}</option>`).join("")}</select></div>
          ${chart(data.daily || [])}
          <h3>Sales performance</h3>
          ${(data.sales || []).length ? `<div class="sk-table"><table><thead><tr><th scope="col">Sale</th><th scope="col">Orders</th><th scope="col">Taken off</th></tr></thead>
            <tbody>${data.sales.map((s) => `<tr><th scope="row">${e(s.name || "Sale")}</th><td>${e(fmt("orders", s.orders))}</td><td>${e(money(s.offCents))}</td></tr>`).join("")}</tbody></table></div>`
            : '<p class="small-print">No sales in this period.</p>'}
          <h3>Traffic sources</h3><p class="small-print">Not tracked yet. AutoStacc counts page views per day and nothing about who viewed.</p>
          <p><a class="btn ghost small" href="${e(`${base}?days=${days}&format=csv`)}" download>Download the daily figures (CSV)</a></p>`;
      }

      async function load() {
        $("[data-si-body]", el).innerHTML = '<p class="msg pending">Loading…</p>';
        el.querySelectorAll("[data-si-days]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.siDays) === days)));
        const res = await api(`${base}?days=${days}`);
        if (!el.isConnected) return;
        if (!res.ok) { $("[data-si-body]", el).innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
        data = res.data;
        draw();
      }

      el.innerHTML = `<div class="si-range" role="group" aria-label="Period">${[30, 90, 365].map((d) => `<button class="btn ghost small" type="button" data-si-days="${d}" aria-pressed="${d === days}">Last ${d} days</button>`).join("")}</div>
        <div data-si-body></div>`;
      el.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-si-days]");
        if (b && Number(b.dataset.siDays) !== days) { days = Number(b.dataset.siDays); load(); }
      });
      el.addEventListener("change", (ev) => { if (ev.target.matches("[data-si-metric]")) { metric = ev.target.value; draw(); } });
      // The hover readout: the day under the pointer, wherever it is in the column (bigger than the bar itself).
      el.addEventListener("pointermove", (ev) => {
        const bars = ev.target.closest(".si-bars");
        const tip = $(".si-tip", el);
        if (!bars || !data) { if (tip) tip.hidden = true; return; }
        const box = bars.getBoundingClientRect(), rows = data.daily || [];
        const i = Math.min(rows.length - 1, Math.max(0, Math.floor(((ev.clientX - box.left) / box.width) * rows.length)));
        const r = rows[i];
        if (!r) return;
        tip.hidden = false;
        tip.textContent = `${r.date}: ${fmt(metric, r[metric])}`;
        tip.style.left = `${Math.min(box.width - tip.offsetWidth, Math.max(0, ev.clientX - box.left - tip.offsetWidth / 2))}px`;
        bars.querySelectorAll(".si-bar.on").forEach((x) => x.classList.remove("on"));
        bars.children[i].classList.add("on");
      });
      el.addEventListener("pointerleave", () => { const tip = $(".si-tip", el); if (tip) tip.hidden = true; }, true);
      load();
    }
  };
})();

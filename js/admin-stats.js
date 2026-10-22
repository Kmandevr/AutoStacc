// Control Center overview: draws GET /api/admin/stats into the Overview tab without knowing any metric in advance
// (server/stats/metric.js is the shape). Every number carries its source, so payment records, store records,
// approximate browser counts and estimates are never mistaken for each other. Period and live/test switch at the top,
// then the figures in tabs (Sales, Customers, Catalog, Creators, Traffic); per-day series are small bar charts (one hue, hover titles) with a table view. Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, cents, api } = window.GS;
  if (!$("#admin-app")) return;
  const SOURCES = {
    payment: "Payment records",
    record: "Store records",
    activity: "Approximate · browser counts",
    derived: "Estimate"
  };
  let state = { days: 30, mode: "" };

  const moneyText = (values) => (values.length ? values.map((v) => cents(v.cents, v.currency)).join(" · ") : "—");
  const cell = (v) => (v === null || v === undefined ? "—" : typeof v === "object" ? ("cents" in v ? cents(v.cents, v.currency) : `${v.percent}%`) : e(String(v)));
  const fmt = (m, v) => (m.format === "money" ? cents(v, m.currency) : String(v));

  // One series, one hue: thin bars on a shared baseline with rounded tops, a native hover title per day.
  function chart(m) {
    const pts = m.series;
    const max = Math.max(1, ...pts.map((p) => p.value));
    const w = 10, h = 100, gap = 2;
    const bars = pts.map((p, i) => {
      const bh = p.value ? Math.max(2, (p.value / max) * (h - 4)) : 0;
      const x = i * w, y = h - bh, bw = w - gap, r = Math.min(2, bh / 2);
      const d = bh ? `M${x},${h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${h}Z` : "";
      return `<g class="stats-bar"><rect x="${x}" y="0" width="${w}" height="${h}" fill="transparent"><title>${e(p.day)}: ${e(fmt(m, p.value))}</title></rect>${d ? `<path d="${d}"/>` : ""}</g>`;
    }).join("");
    const total = pts.reduce((t, p) => t + p.value, 0);
    return `<figure class="stats-chart"><figcaption><span>${e(m.label)}</span><span class="stats-total">${e(fmt(m, total))} total · peak ${e(fmt(m, max === 1 && !total ? 0 : max))}</span></figcaption>
      <svg viewBox="0 0 ${pts.length * w} ${h}" preserveAspectRatio="none" role="img" aria-label="${e(m.label)}, ${pts.length} days">${bars}<line x1="0" y1="${h}" x2="${pts.length * w}" y2="${h}"/></svg>
      <div class="stats-axis"><span>${e(pts[0] ? pts[0].day : "")}</span><span>${e(pts.length ? pts[pts.length - 1].day : "")}</span></div>
      <details><summary>Table</summary>${table(["Day", m.label], pts.map((p) => [p.day, fmt(m, p.value)]))}</details>
      <p class="stats-source" data-source="${e(m.source)}">${e(SOURCES[m.source])}</p></figure>`;
  }

  const table = (cols, data) => `<div class="admin-table"><table><thead><tr>${cols.map((c) => `<th scope="col">${e(c)}</th>`).join("")}</tr></thead>
    <tbody>${data.map((r) => `<tr>${r.map((v) => `<td>${cell(v)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length}">Nothing yet.</td></tr>`}</tbody></table></div>`;

  function card(m) {
    const value = m.format === "money" ? moneyText(m.values) : m.format === "percent" ? (m.value === null ? "—" : `${m.value}%`) : m.value.toLocaleString();
    return `<div class="stat" data-source="${e(m.source)}"><span class="stat-label">${e(m.label)}</span><span class="stat-value">${e(value)}</span>
      <span class="stats-source" data-source="${e(m.source)}">${e(SOURCES[m.source])}</span>${m.note ? `<span class="small-print">${e(m.note)}</span>` : ""}</div>`;
  }

  function section(s) {
    const cards = s.metrics.filter((m) => !m.series && !m.rows);
    const wide = s.metrics.filter((m) => m.series || m.rows);
    return `<section class="stats-section" aria-labelledby="stats-${e(s.id)}"><h2 id="stats-${e(s.id)}">${e(s.title)}</h2>
      <div class="stats-grid">${cards.map(card).join("")}</div>
      <div class="stats-wide">${wide.map((m) => (m.series ? chart(m) : `<div class="stats-rows"><h3>${e(m.label)}</h3>${table(m.columns, m.rows)}${m.note ? `<p class="small-print">${e(m.note)}</p>` : ""}<p class="stats-source" data-source="${e(m.source)}">${e(SOURCES[m.source])}</p></div>`)).join("")}</div></section>`;
  }

  async function draw() {
    const el = $("#admin-overview");
    const out = $("[data-stats-out]", el);
    const sk = window.GS.skeleton; // chart-sized placeholders while the figures are counted (js/skeleton.js)
    if (sk) sk.show(out, "panel", 3); else out.innerHTML = `<p class="msg pending">Counting…</p>`;
    const res = await api(`/api/admin/stats?days=${state.days}${state.mode ? `&mode=${state.mode}` : ""}`);
    if (sk) sk.done(out);
    if (!res.ok) { out.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    const d = res.data;
    state.mode = d.mode;
    $("[data-stats-mode]", el).value = d.mode;
    out.innerHTML = `<p class="admin-mode ${d.mode}"><strong>${d.mode === "live" ? "LIVE" : "TEST"} figures</strong> ${e(d.since)} to ${e(d.until)}${d.mode === "live" ? "" : " · test orders only, never revenue"}</p>
      ${tabsHTML(d.sections)}<p class="small-print">Generated ${e(d.generatedAt.slice(0, 16).replace("T", " "))} UTC.</p>`;
  }

  // The figures in tabs on the same page (owner, 2026-10-22): Sales, Customers, Catalog, Creators, Traffic; a section
  // the list doesn't name gets a tab of its own. The open tab is kept while the period or mode changes.
  const TABS = [["sales", "Sales", ["sales", "promotions"]], ["customers", "Customers", ["customers"]], ["catalog", "Catalog", ["products", "downloads"]],
    ["creators", "Creators", ["creators"]], ["traffic", "Traffic", ["activity"]]];
  let openTab = "sales";
  function tabsHTML(sections) {
    const named = new Set(TABS.flatMap((t) => t[2]));
    const tabs = [...TABS, ...sections.filter((x) => !named.has(x.id)).map((x) => [x.id, x.title, [x.id]])]
      .map(([id, label, ids]) => [id, label, sections.filter((x) => ids.includes(x.id))]).filter((t) => t[2].length);
    if (!tabs.some((t) => t[0] === openTab)) openTab = tabs.length ? tabs[0][0] : "sales";
    return `<div class="stats-tabs" role="tablist" aria-label="Figures">${tabs.map(([id, label]) =>
      `<button type="button" role="tab" id="stats-tab-${e(id)}" aria-controls="stats-panel-${e(id)}" aria-selected="${id === openTab}" tabindex="${id === openTab ? 0 : -1}" data-stats-tab="${e(id)}">${e(label)}</button>`).join("")}</div>
      ${tabs.map(([id, , list]) => `<div class="stats-panel" role="tabpanel" id="stats-panel-${e(id)}" aria-labelledby="stats-tab-${e(id)}"${id === openTab ? "" : " hidden"}>${list.map(section).join("")}</div>`).join("")}`;
  }
  function pick(el, id, focus) {
    openTab = id;
    el.querySelectorAll("[data-stats-tab]").forEach((b) => { const on = b.dataset.statsTab === id; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    el.querySelectorAll(".stats-panel").forEach((p) => { p.hidden = p.id !== `stats-panel-${id}`; });
  }

  addEventListener("gs:admin", () => {
    const el = $("#admin-overview");
    el.innerHTML = `<form class="admin-search stats-controls" data-stats>
        <label for="stats-days">Period</label><select id="stats-days" data-stats-days><option value="7">7 days</option><option value="30" selected>30 days</option><option value="90">90 days</option><option value="365">1 year</option></select>
        <label for="stats-mode">Orders</label><select id="stats-mode" data-stats-mode><option value="live">Live</option><option value="test">Test</option></select>
        <button class="btn ghost" type="submit">Refresh</button></form>
      <p class="stats-legend">${Object.entries(SOURCES).map(([k, l]) => `<span class="stats-source" data-source="${k}">${e(l)}</span>`).join("")}</p>
      <div data-stats-out></div>`;
    // Tabs switch in place, without touching the address (it holds the open section of the Control Center).
    el.addEventListener("click", (ev) => {
      const tab = ev.target.closest("[data-stats-tab]");
      if (tab) pick(el, tab.dataset.statsTab, false);
    });
    el.addEventListener("keydown", (ev) => {
      const tab = ev.target.closest("[data-stats-tab]");
      const step = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
      if (!tab || !step) return;
      ev.preventDefault();
      const all = [...el.querySelectorAll("[data-stats-tab]")];
      pick(el, all[(all.indexOf(tab) + step + all.length) % all.length].dataset.statsTab, true);
    });
    el.addEventListener("submit", (ev) => {
      ev.preventDefault();
      state = { days: Number($("[data-stats-days]", el).value), mode: $("[data-stats-mode]", el).value };
      draw();
    });
    draw();
  });
})();

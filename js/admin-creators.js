// Control Center: the Creators tab. Every creator with its address, projects, storage and settings, and the switches
// to run free creator sites: trust (lets search engines index its pages), suspend (its pages and images disappear),
// whether its packs always wait for review (else only flagged ones do), and its own storage quota or platform fee
// (empty = the platform default). Above them, whether creators' products can be bought (closed anyway until the
// marketplace Stripe key is set), switched in Settings › Switches. Talks to /api/admin/creators and /api/admin/creator-sales
// (server/admin/creators.js, creator-sales.js). Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const root = $("#admin-app");
  if (!root) return;
  const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

  // Whether customers can buy creators' products: open, paused here, or waiting for the marketplace Stripe key.
  function salesSwitch(s) {
    const state = s.open ? "Open: customers can buy creators' products."
      : s.reason === "no_key" ? `Closed: the marketplace Stripe key isn't set up yet (STRIPE_MARKETPLACE_KEY, see docs/payouts-setup.md). Creators' products can be added to carts but not checked out.${s.paused ? " You have also paused them." : ""}`
      : "Paused by you: creators' products can be added to carts but not checked out.";
    // The switch itself has one home, Settings › Switches (owner, 2026-10-22); here, the state and a link there.
    return `<div class="panel admin-switch" data-creator-sales><h3>Creator purchases</h3><p>${e(state)}</p>
      <p class="small-print"><a href="/admin/settings#switches">Change it in Settings › Switches</a></p></div>`;
  }

  async function draw(panel, message) {
    const [res, sales] = await Promise.all([api("/api/admin/creators"), api("/api/admin/creator-sales")]);
    if (!res.ok) { panel.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    const rows = res.data.creators;
    panel.innerHTML = `${message ? `<p class="msg" role="status">${e(message)}</p>` : ""}
      ${sales.ok ? salesSwitch(sales.data.creatorSales) : ""}
      <p class="small-print">${rows.length} creators. New creators' pages are noindex until you trust them. Fees are in basis points (100 = 1%).</p>
      <div class="admin-table"><table><thead><tr><th>Creator</th><th>Projects</th><th>Storage</th><th>Fee</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map((c) => `<tr data-id="${e(c.id)}">
        <td><a href="/${e(c.slug)}" target="_blank" rel="noopener">${e(c.name)}</a><br><span class="small-print">/${e(c.slug)} · ${e(c.source)}</span></td>
        <td>${c.publishedProjects} live / ${c.projects}</td>
        <td>${mb(c.usedBytes)} of <input type="number" min="0" step="1" aria-label="Quota in MB for ${e(c.name)}" data-quota value="${c.ownQuota ? Math.round(c.quotaBytes / 1048576) : ""}" placeholder="${Math.round(c.quotaBytes / 1048576)}"> MB</td>
        <td><input type="number" min="0" max="10000" step="1" aria-label="Platform fee in basis points for ${e(c.name)}" data-fee value="${c.ownFee ? c.feeBps : ""}" placeholder="${c.feeBps}"></td>
        <td>${c.status === "active" ? "Active" : "<strong>Suspended</strong>"}${c.trusted ? " · Trusted" : ""}${c.packReview === "always_hold" ? " · Pacs always reviewed" : ""}</td>
        <td><button class="btn ghost small" type="button" data-save>Save limits</button>
          <button class="btn ghost small" type="button" data-set='${JSON.stringify({ trusted: !c.trusted })}'>${c.trusted ? "Untrust" : "Trust"}</button>
          <button class="btn ghost small" type="button" data-set='${JSON.stringify({ packReview: c.packReview === "always_hold" ? "auto" : "always_hold" })}'>${c.packReview === "always_hold" ? "Review flagged Pacs only" : "Review every Pac"}</button>
          <button class="btn ghost small" type="button" data-set='${JSON.stringify({ status: c.status === "active" ? "suspended" : "active" })}'>${c.status === "active" ? "Suspend" : "Reinstate"}</button></td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  window.addEventListener("gs:admin", () => {
    const panel = $("#admin-creators");
    if (!panel) return;
    draw(panel);
    panel.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button[data-set], button[data-save]");
      if (!btn) return;
      const row = btn.closest("tr");
      let body;
      if (btn.dataset.set) body = JSON.parse(btn.dataset.set);
      else {
        const quota = $("[data-quota]", row).value.trim();
        const fee = $("[data-fee]", row).value.trim();
        body = { storageQuotaBytes: quota === "" ? null : Math.round(Number(quota) * 1048576), platformFeeBps: fee === "" ? null : Math.round(Number(fee)) };
      }
      if (body.status === "suspended" && !await window.GS.confirm("Suspend this creator? Their pages and images go offline at once.")) return;
      btn.disabled = true;
      const res = await api(`/api/admin/creators/${encodeURIComponent(row.dataset.id)}`, { method: "PATCH", body });
      btn.disabled = false;
      draw(panel, res.ok ? "Saved." : res.error.message);
    });
  });
})();

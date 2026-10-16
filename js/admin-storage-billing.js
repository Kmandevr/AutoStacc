// Control Center: Paid storage (server/billing/, docs/creators.md "Paid storage"). The owner's switches (on or off, the
// rate; on needs a rate), AutoStacc's storage cap against the paid limits creators hold, every plan with its latest
// measurement, statements to pay or overdue with waive and refund (a note required; audited), one creator's daily
// measurements for a dispute, and the billing log. Talks to /api/admin/storage-billing (server/admin/storage-billing.js).
// Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, cents, api } = window.GS;
  if (!$("#admin-app")) return;
  const GB = 1024 ** 3;
  const size = (n) => (n == null ? "–" : n >= GB ? `${(n / GB).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`);
  const day = (iso) => (iso ? iso.slice(0, 10) : "");

  function draw(panel, x, message) {
    const st = x.settings;
    const tight = x.platform.activePaidLimitBytes > x.platform.capBytes;
    panel.innerHTML = `${message ? `<p class="msg" role="status">${e(message)}</p>` : ""}
      <form class="panel admin-switch" data-billing><h3>Switches</h3>
        <p>Paid storage is <strong>${st.on ? "on" : "off"}</strong>${st.rate ? ` at ${st.rate} hundredths of a cent per GB-month ($${(st.rate / 10000).toFixed(4)})` : ", no rate set"}.
          Creators are charged for what they store above their free storage, measured daily; statements are issued after each month, due in ${st.graceDays} days.</p>
        <label>Rate <input type="number" name="rate" min="1" max="999999" step="1" value="${st.rate || ""}" placeholder="unset"> hundredths of a cent per GB-month</label>
        <label><input type="checkbox" name="on"${st.state === "on" ? " checked" : ""}> Paid storage on</label>
        <p class="small-print">Turning it on lets creators choose a limit and starts real charges at month end. Confirm the price, the tax code and the main Stripe account first (docs/creators.md).</p>
        <button class="btn small" type="submit">Save</button></form>
      <p${tight ? ' class="msg error"' : ""}>Paid limits held: ${e(size(x.platform.activePaidLimitBytes))}; AutoStacc's storage cap (Usage and storage): ${e(size(x.platform.capBytes))}.${tight ? " Creators could be refused uploads they pay for: raise the cap." : ""}</p>
      <h3>Statements</h3>
      <div class="admin-table"><table><thead><tr><th>Creator</th><th>Month</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${x.statements.map((s) => `<tr>
        <td><button class="btn ghost small" type="button" data-creator="${e(s.creatorId)}" data-period="${e(s.period)}">${e(s.name)}</button></td><td>${e(s.period)}</td>
        <td>${cents(s.amountCents, s.currency)}${s.earningsCents ? ` <span class="small-print">+ ${cents(s.earningsCents)} from earnings</span>` : ""}</td><td>${e(s.status)}${s.overdue ? " · overdue" : s.status === "open" ? ` · due ${e(day(s.dueAt))}` : ""}</td>
        <td>${["open", "carried", "disputed"].includes(s.status) ? `<button class="btn ghost small" type="button" data-act="waive" data-id="${e(s.id)}">Waive</button>` : ""}
          ${s.status === "paid" && (s.amountCents || s.earningsCents) ? `<button class="btn ghost small danger" type="button" data-act="refund" data-id="${e(s.id)}">Refund</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="5">None yet.</td></tr>'}</tbody></table></div>
      <h3>Plans</h3>
      <div class="admin-table"><table><thead><tr><th>Creator</th><th>Status</th><th>Monthly cap</th><th>Limit</th><th>Last measured</th></tr></thead><tbody>${x.plans.map((p) => `<tr>
        <td>${e(p.name)} <span class="small-print">/${e(p.slug)}</span></td><td>${e(p.status)}</td><td>${cents(p.capCents)}</td><td>${e(size(p.capBytes))}</td><td>${e(size(p.lastUsedBytes))} ${e(p.lastDay || "")}</td></tr>`).join("") || '<tr><td colspan="5">None yet.</td></tr>'}</tbody></table></div>
      <div data-detail></div>
      <details><summary>Billing log</summary><ul>${x.log.map((l) => `<li>${e(day(l.at))} ${e(l.name)}: ${e(l.action)} (${e(l.actor === "system" ? "system" : "account")})</li>`).join("")}</ul></details>`;
  }

  async function load(panel, message) {
    const res = await api("/api/admin/storage-billing");
    if (!res.ok) { panel.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    draw(panel, res.data, message);
  }

  async function send(panel, path, method, body, button) {
    button.disabled = true;
    const res = await api(path, { method, body });
    if (!res.ok) { button.disabled = false; return load(panel, res.error.message); }
    draw(panel, res.data, "Saved.");
  }

  async function detail(panel, creatorId, period) {
    const res = await api(`/api/admin/storage-billing/creators/${encodeURIComponent(creatorId)}?period=${encodeURIComponent(period)}`);
    if (!res.ok) return;
    const d = res.data;
    $("[data-detail]", panel).innerHTML = `<details open><summary>${e(d.creator.name)}, ${e(d.period)}, day by day</summary><div class="admin-table"><table>
      <thead><tr><th>Day</th><th>Stored</th><th>Free</th><th>Billable</th><th>Rate</th></tr></thead><tbody>${d.days.map((x) => `<tr><td>${e(x.day)}</td><td>${e(size(x.used_bytes))}</td>
      <td>${e(size(x.included_bytes))}</td><td>${e(size(x.billable_bytes))}</td><td>${e(x.rate ?? "–")}</td></tr>`).join("")}</tbody></table></div>
      <ul>${d.log.slice(0, 30).map((l) => `<li>${e(day(l.at))}: ${e(l.action)} ${e(JSON.stringify(l.detail))}</li>`).join("")}</ul></details>`;
  }

  window.addEventListener("gs:admin", () => {
    const panel = $("#admin-storage-billing");
    if (!panel) return;
    load(panel);
    panel.addEventListener("submit", (ev) => {
      const form = ev.target.closest("[data-billing]");
      if (!form) return;
      ev.preventDefault();
      const rate = form.rate.value ? Number(form.rate.value) : null;
      send(panel, "/api/admin/storage-billing", "PUT", { rate, state: form.on.checked ? "on" : "off" }, form.querySelector("button"));
    });
    panel.addEventListener("click", (ev) => {
      const act = ev.target.closest("[data-act]");
      if (act) {
        const note = prompt(act.dataset.act === "refund" ? "Why is this statement refunded? (the creator sees this)" : "Why is this statement waived? (the creator sees this)");
        if (note && note.trim().length >= 3) send(panel, `/api/admin/storage-billing/statements/${encodeURIComponent(act.dataset.id)}/${act.dataset.act}`, "POST", { note: note.trim() }, act);
        return;
      }
      const c = ev.target.closest("[data-creator]");
      if (c) detail(panel, c.dataset.creator, c.dataset.period);
    });
  });
})();

// Control Center: Usage and storage, the budget guard (server/usage/, docs/packs.md). This month's Container time,
// storage writes and storage against Cloudflare's free allowance, the level (from 80% processing skips listening to
// audio; from 95% new processing waits for next month), whether spending past it is allowed this month (switched in Settings › Switches), and how
// much storage creators' uploads may fill: the base the owner sets, plus what paid plans add (shown, not edited). Talks to /api/admin/usage (server/admin/usage.js). Starts on "gs:admin".
// Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  if (!$("#admin-app")) return;
  const LABEL = { container_ms: "Container time", class_a: "Storage writes (Class A)", r2_bytes: "Storage" };
  const amount = (meter, n) => meter === "container_ms" ? `${(n / 3600000).toFixed(1)} h`
    : meter === "r2_bytes" ? `${(n / 1e9).toFixed(2)} GB` : n.toLocaleString("en");
  const gb = (n) => `${((n || 0) / 1e9).toFixed(2)} GB`;
  const LEVEL = {
    ok: "Inside the free allowance.",
    alert: "Over 80% of the free allowance: Pac processing skips listening to audio until next month.",
    pause: "Over 95% of the free allowance: new Pac processing waits for next month."
  };

  function draw(panel, u, message) {
    const rows = Object.entries(u.meters).map(([m, x]) => `<tr><th scope="row">${e(LABEL[m] || m)}</th>
      <td>${e(amount(m, x.used))} of ${e(amount(m, x.allowance))}</td>
      <td><meter min="0" max="1" low="0.8" high="0.95" optimum="0" value="${Math.min(1, x.share)}" aria-label="${e(LABEL[m] || m)}"></meter> ${Math.round(x.share * 100)}%</td></tr>`).join("");
    panel.innerHTML = `${message ? `<p class="msg" role="status">${e(message)}</p>` : ""}
      <p><strong>${e(u.month)}</strong>: ${e(LEVEL[u.level])}${u.allowed ? " You allowed spending past it this month." : ""}${u.waiting ? ` ${u.waiting} version${u.waiting === 1 ? "" : "s"} waiting.` : ""}</p>
      <div class="admin-table"><table><thead><tr><th>Meter</th><th>Used</th><th>Share</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small-print">Storage is measured from what AutoStacc stores; Container time and writes are estimated from each job (with its start-up). Cloudflare's own billing is the record: set a billing notification there too.</p>
      <div class="panel admin-switch"><h3>Spending this month</h3>
        <p>${u.allowed ? "Processing may go past the free allowance until the month ends (paid at Cloudflare's rates)." : "Processing stops at 95% of the free allowance."}</p>
        <p class="small-print"><a href="/admin/settings#switches">Change it in Settings › Switches</a></p></div>
      <form class="panel admin-switch" data-cap><h3>Storage for creators</h3>
        <p>Creators' uploads are refused once AutoStacc stores this much (the free allowance is 10 GB; more costs about $0.015 per GB a month).</p>
        <p>Base ${e(gb(u.baseCapBytes))} + paid storage ${e(gb(u.paidCapBytes))} = cap ${e(gb(u.capBytes))}. The paid part is what creators' active plans hold above their free storage; it grows and shrinks with the plans on its own.</p>
        <label>Base <input type="number" name="capGb" min="1" max="9999" step="1" required value="${Math.round(u.baseCapBytes / 1e9)}"> GB</label>
        <button class="btn small" type="submit">Save</button></form>`;
  }

  async function load(panel, message) {
    const res = await api("/api/admin/usage");
    if (!res.ok) { panel.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    draw(panel, res.data.usage, message);
  }

  async function save(panel, body, button) {
    button.disabled = true;
    const res = await api("/api/admin/usage", { method: "PUT", body });
    if (!res.ok) { button.disabled = false; return load(panel, res.error.message); }
    draw(panel, res.data.usage, "Saved.");
  }

  window.addEventListener("gs:admin", () => {
    const panel = $("#admin-usage");
    if (!panel) return;
    load(panel);
    panel.addEventListener("submit", (ev) => {
      const form = ev.target.closest("[data-cap]");
      if (!form) return;
      ev.preventDefault();
      save(panel, { capGb: Number(form.capGb.value) }, form.querySelector("button"));
    });
  });
})();

// Control Center: Settings › Switches (owner, 2026-10-16). Every store-wide switch in one place, each saying what it
// does now, with one button that asks before it flips: all sales, payout requests, new accounts, new creators and
// reviews (/api/admin/switches, server/admin/switches.js), creator purchases (/api/admin/creator-sales), paid storage
// (/api/admin/storage-billing) and spending past the free allowance (/api/admin/usage); and the notice shown on every
// page. The server enforces each one and logs every change in the audit log. Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const root = $("#admin-app");
  if (!root) return;

  // [key, title, what "on" means, what "off" means, the on value, the off value]
  const SIMPLE = [
    ["store_sales", "Store sales", "Anyone can buy and claim free items.", "Sales are paused: checkout and free claims are refused; the store stays open to browse.", "open", "paused"],
    ["payout_requests", "Payout requests", "Creators can request payouts.", "Payout requests are paused; creators still see their earnings, and earlier requests are untouched.", "open", "paused"],
    ["signups", "New accounts", "Anyone can create an account.", "New accounts are closed; existing accounts still log in.", "open", "closed"],
    ["creator_signups", "New creators", "Signed-in people can claim a creator name in the Studio.", "New creator names are closed; existing creators carry on.", "open", "closed"],
    ["reviews", "Reviews", "Owners can write and edit reviews.", "Writing reviews is paused; existing reviews stay up.", "open", "paused"]
  ];

  const row = (id, title, on, text, label, danger) => `<li class="admin-switch-row" data-switch-row="${id}">
    <div><h3>${e(title)} <span class="admin-pill ${on ? "is-on" : "is-off"}">${on ? "On" : "Off"}</span></h3><p>${e(text)}</p></div>
    <button class="btn small ghost${danger ? " danger" : ""}" type="button" data-switch="${id}">${e(label)}</button></li>`;

  async function draw(panel, message) {
    const [sw, cs, sb, us] = await Promise.all(["/api/admin/switches", "/api/admin/creator-sales", "/api/admin/storage-billing", "/api/admin/usage"].map((p) => api(p)));
    if (!sw.ok) { panel.innerHTML = `<p class="msg error">${e(sw.error.message)}</p>`; return; }
    const v = sw.data.switches;
    const rows = SIMPLE.map(([k, title, onText, offText, onV]) => {
      const on = v[k] === onV;
      return row(k, title, on, on ? onText : offText, on ? "Turn off" : "Turn on", on);
    });
    if (cs.ok) {
      const c = cs.data.creatorSales;
      rows.push(row("creator_sales", "Creator purchases", !c.paused, c.paused ? "Creators' products can't be bought."
        : c.keyReady ? "Creators' products can be bought." : "Allowed, but closed until the marketplace Stripe key is set.", c.paused ? "Turn on" : "Turn off", !c.paused));
    }
    if (sb.ok) {
      const on = sb.data.settings.state === "on";
      rows.push(row("storage_billing", "Paid storage charges", on, on ? "Creators can take paid storage and are charged for it." : "Off: no creator is offered or charged for paid storage.", on ? "Turn off" : "Turn on", on));
    }
    if (us.ok) {
      rows.push(row("usage", "Spending past the free allowance", us.data.allowed, us.data.allowed ? "Allowed this month (paid at Cloudflare's rates)." : "Processing stops at 95% of the free allowance.",
        us.data.allowed ? "Turn off" : "Allow this month", false));
    }
    panel.innerHTML = `${message ? `<p class="msg" role="status">${e(message)}</p>` : ""}
      <p class="small-print">Each switch takes effect at once, is enforced by the store itself (not just this page) and is logged in the audit log.</p>
      <ul class="admin-switches">${rows.join("")}</ul>
      <form class="admin-switch-row admin-notice" data-notice-form>
        <div><h3><label for="site-notice">Notice on every page</label></h3>
          <p>A short line at the top of every page (maintenance, a sale ending). Leave it empty for none. Pages pick it up within a minute.</p>
          <input id="site-notice" maxlength="200" value="${e(v.site_notice)}" placeholder="No notice"></div>
        <div class="actions"><button class="btn small" type="submit">Save notice</button>${v.site_notice ? '<button class="btn small ghost" type="button" data-notice-clear>Clear</button>' : ""}</div>
      </form>`;
  }

  async function flip(panel, id) {
    const btn = $(`[data-switch="${id}"]`, panel);
    const title = $(`[data-switch-row="${id}"] h3`, panel).firstChild.textContent.trim();
    const on = $(`[data-switch-row="${id}"] .is-on`, panel) !== null;
    if (!confirm(`${on ? "Turn off" : "Turn on"} ${title}?`)) return;
    btn.disabled = true;
    const simple = SIMPLE.find(([k]) => k === id);
    const res = simple ? await api("/api/admin/switches", { method: "PUT", body: { key: id, value: on ? simple[5] : simple[4] } })
      : id === "creator_sales" ? await api("/api/admin/creator-sales", { method: "PUT", body: { open: !on } })
      : id === "storage_billing" ? await api("/api/admin/storage-billing", { method: "PUT", body: { state: on ? "off" : "on" } })
      : await api("/api/admin/usage", { method: "PUT", body: { allowThisMonth: !on } });
    await draw(panel, res.ok ? `${title}: ${on ? "off" : "on"}.` : res.error.message);
  }

  async function notice(panel, text) {
    const res = await api("/api/admin/switches", { method: "PUT", body: { key: "site_notice", value: text } });
    await draw(panel, res.ok ? (text ? "Notice saved." : "Notice cleared.") : res.error.message);
  }

  addEventListener("gs:admin", () => {
    const panel = $("#admin-switches");
    if (!panel) return;
    draw(panel);
    panel.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-switch]");
      if (b) return flip(panel, b.dataset.switch);
      if (ev.target.closest("[data-notice-clear]")) return notice(panel, "");
    });
    panel.addEventListener("submit", (ev) => {
      if (!ev.target.matches("[data-notice-form]")) return;
      ev.preventDefault();
      notice(panel, $("#site-notice", panel).value.trim());
    });
  });
})();

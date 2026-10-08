// Control Center: the Test purchases tab (how a test purchase works, the test orders and a verification checklist
// for each, from /api/admin/test-purchases) and the Audit log tab (/api/admin/audit, filterable, newest first, with
// "admin → as customer" attribution for anything done while impersonating). Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, cents, api } = window.GS;
  const root = $("#admin-app");
  if (!root) return;
  const ACTIONS = ["", "admin", "impersonation", "test_purchase", "customer", "order", "entitlement", "product", "preview", "project"];
  const when = (iso) => e(String(iso || "").slice(0, 19).replace("T", " "));
  const mark = (ok) => (ok === true ? "✔ pass" : ok === false ? "✖ fail" : "– n/a");

  async function tests(live) {
    const el = $("#admin-tests");
    if (live) {
      el.innerHTML = `<p class="admin-mode live"><strong>LIVE</strong> This store takes real payments, so test purchases are off here.</p>
        <p>Run them on a preview deployment (Stripe test key) or locally with <code>npm run dev</code>: same code, test payments only.</p>`;
      return;
    }
    const res = await api("/api/admin/test-purchases");
    if (!res.ok) { el.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    el.innerHTML = `<p class="admin-mode test"><strong>TEST</strong> Payments here are ${e(res.data.provider)} test payments: never real revenue.</p>
      <ol class="small-print"><li>Customers → preview a customer → Start test purchase (opens an impersonation as them).</li>
        <li>Buy the product like they would: cart, checkout, test payment (Stripe test card 4242 4242 4242 4242).</li>
        <li>Open Your Stacc and download a file, then Exit impersonation.</li><li>Verify the order below.</li></ol>
      <div class="admin-table"><table><thead><tr><th scope="col">Order</th><th scope="col">Status</th><th scope="col">Total</th><th scope="col">Created</th><th scope="col"></th></tr></thead><tbody>
      ${res.data.orders.map((o) => `<tr><td>${e(o.id)}</td><td>${e(o.status)}</td><td>${cents(o.total_cents, o.currency)}</td><td>${when(o.created_at)}</td>
        <td><button class="link-btn" type="button" data-verify="${e(o.id)}">verify</button></td></tr>`).join("") || `<tr><td colspan="5">No test purchases yet.</td></tr>`}</tbody></table></div>
      <div id="test-verify"></div>`;
  }

  async function verify(orderId) {
    const el = $("#test-verify");
    const res = await api(`/api/admin/test-purchases/${encodeURIComponent(orderId)}`);
    if (!res.ok) { el.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    el.innerHTML = `<div class="panel wide"><h2>${e(res.data.orderId)}</h2><ul class="admin-checks">${res.data.checks.map((c) =>
      `<li data-ok="${String(c.ok)}"><strong>${mark(c.ok)}</strong> ${e(c.label)} <span class="small-print">${e(c.detail || "")}</span></li>`).join("")}</ul></div>`;
  }

  async function audit(action = "", before = "") {
    const el = $("#admin-audit");
    const q = new URLSearchParams({ ...(action && { action }), ...(before && { before }) });
    const res = await api(`/api/admin/audit?${q}`);
    if (!res.ok) { el.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    const rows = res.data.entries.map((a) => `<tr><td>${when(a.at)}</td>
      <td>${e(a.actor)}${a.impersonationId ? ` <span class="admin-as">→ as ${e(a.subjectEmail || a.subjectUserId || "customer")}</span>` : ""}</td>
      <td>${e(a.action)}</td><td>${e([a.targetType, a.targetId].filter(Boolean).join(" "))}${!a.impersonationId && a.subjectEmail ? ` <span class="small-print">(${e(a.subjectEmail)})</span>` : ""}</td>
      <td class="small-print">${e(Object.entries(a.detail).map(([k, v]) => `${k}: ${v}`).join(", "))}</td></tr>`).join("");
    const head = before ? "" : `<form class="admin-search" data-audit><label for="audit-action">Show</label><select id="audit-action">${ACTIONS.map((x) =>
      `<option value="${x}"${x === action ? " selected" : ""}>${x || "everything"}</option>`).join("")}</select><button class="btn ghost" type="submit">Filter</button></form>
      <p class="small-print">Append-only: entries can't be edited or deleted. Catalog changes are recorded by the database as "catalog sync"; news and events are changed in git, so their history is the repository's.</p>`;
    const body = `<tbody>${rows || `<tr><td colspan="5">Nothing recorded.</td></tr>`}</tbody>`;
    if (before) {
      $("#admin-audit tbody").insertAdjacentHTML("beforeend", rows);
    } else {
      el.innerHTML = head + `<div class="admin-table"><table><thead><tr><th scope="col">When (UTC)</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">On</th><th scope="col">Detail</th></tr></thead>${body}</table></div><div data-audit-more></div>`;
    }
    $("[data-audit-more]", el).innerHTML = res.data.next ? `<button class="btn ghost" type="button" data-audit-older="${e(res.data.next)}">Older</button>` : "";
  }

  addEventListener("gs:admin", (ev) => {
    tests(ev.detail && ev.detail.livePayments);
    audit();
    root.addEventListener("click", (e2) => {
      const v = e2.target.closest("[data-verify]");
      if (v) return verify(v.dataset.verify);
      const o = e2.target.closest("[data-audit-older]");
      if (o) { o.disabled = true; return audit($("#audit-action").value, o.dataset.auditOlder); }
    });
    root.addEventListener("submit", (e2) => {
      if (!e2.target.matches("[data-audit]")) return;
      e2.preventDefault();
      audit($("#audit-action").value);
    });
  });
})();

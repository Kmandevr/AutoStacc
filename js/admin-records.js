// Admin records: orders (with payment events, entitlements and a resend-receipt button), customers, entitlements
// (grant manual/promo/replacement access, revoke) and the daily analytics counters. Starts when js/admin.js fires
// "gs:admin" after the access check. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, cents, api } = window.GS;
  if (!$("#admin-app")) return;
  const fail = (el, res) => (el.innerHTML = `<p class="msg error">${escapeHTML(res.error.message)}</p>`);
  const table = (cols, rows) => `<div class="admin-table"><table><thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${cols.length}">Nothing yet.</td></tr>`}</tbody></table></div>`;
  const search = (name, label, placeholder) => `<form class="admin-search" data-search="${name}"><label class="sr-only" for="q-${name}">${label}</label><input id="q-${name}" type="search" placeholder="${placeholder}"><button class="btn ghost" type="submit">Search</button></form>`;

  async function orders(q = "") {
    const el = $("#admin-orders");
    const res = await api(`/api/admin/orders${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (!res.ok) return fail(el, res);
    el.innerHTML = search("orders", "Search orders", "email or order id") + table(["Order", "Email", "Status", "Total", "Created", ""],
      res.data.orders.map((o) => `<tr><td>${escapeHTML(o.id)}${o.livemode ? "" : ' <span class="small-print">test</span>'}</td><td>${escapeHTML(o.email)}</td><td>${escapeHTML(o.status)}</td><td>${cents(o.totalCents, o.currency)}</td><td>${escapeHTML(o.createdAt.slice(0, 16).replace("T", " "))}</td>
        <td><button class="link-btn" type="button" data-order="${escapeHTML(o.id)}">details</button></td></tr>`)) + `<div id="order-detail"></div>`;
  }

  async function orderDetail(id) {
    const el = $("#order-detail");
    const res = await api(`/api/admin/orders/${encodeURIComponent(id)}`);
    if (!res.ok) return fail(el, res);
    const { order: o, events, entitlements, emails } = res.data;
    el.innerHTML = `<div class="panel wide"><h2>${escapeHTML(o.id)}</h2>
      <p>${escapeHTML(o.email)} · ${escapeHTML(o.status)} · ${cents(o.totalCents, o.currency)} · ${escapeHTML(o.provider)} ${escapeHTML(o.providerPaymentId || "")}</p>
      <ul>${o.items.map((i) => `<li>${escapeHTML(i.title)} ×${i.quantity} — ${cents(i.lineTotalCents, o.currency)}</li>`).join("")}</ul>
      <h3>Payment events</h3><ul>${events.map((e) => `<li>${escapeHTML(e.received_at)} ${escapeHTML(e.type)} → ${escapeHTML(e.outcome)} ${escapeHTML(e.detail || "")}</li>`).join("") || "<li>none</li>"}</ul>
      <h3>Entitlements</h3><ul>${entitlements.map((e) => `<li>${escapeHTML(e.product_id)}: ${escapeHTML(e.status)}${e.revoke_reason ? ` (${escapeHTML(e.revoke_reason)})` : ""}</li>`).join("") || "<li>none</li>"}</ul>
      <h3>Emails</h3><ul>${emails.map((m) => `<li>${escapeHTML(m.created_at)} ${escapeHTML(m.kind)}: ${escapeHTML(m.status)} ${escapeHTML(m.error || "")}</li>`).join("") || "<li>none</li>"}</ul>
      ${o.status === "paid" ? `<div class="actions"><button class="btn ghost" type="button" data-resend="${escapeHTML(o.id)}">Resend receipt</button><span class="msg" role="status"></span></div>` : ""}</div>`;
  }

  async function customers(q = "") {
    const el = $("#admin-customers");
    const res = await api(`/api/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (!res.ok) return fail(el, res);
    el.innerHTML = search("customers", "Search customers", "email or name") + table(["Email", "Name", "Verified", "Role", "Paid orders", "Owned", "Joined"],
      res.data.customers.map((c) => `<tr><td>${escapeHTML(c.email)}</td><td>${escapeHTML(c.name)}</td><td>${c.verified ? "yes" : "no"}</td><td>${escapeHTML(c.role || "customer")}</td><td>${c.paidOrders}</td><td>${c.owned}</td><td>${escapeHTML(String(c.createdAt).slice(0, 10))}</td></tr>`));
  }

  async function entitlements(email = "") {
    const el = $("#admin-entitlements");
    const res = await api(`/api/admin/entitlements${email ? `?email=${encodeURIComponent(email)}` : ""}`);
    if (!res.ok) return fail(el, res);
    el.innerHTML = `<form class="panel wide" data-grant><h2>Grant access</h2><p class="msg" role="status"></p>
        <div class="field"><label for="g-email">Email</label><input id="g-email" type="email" required></div>
        <div class="field"><label for="g-product">Product id</label><input id="g-product" type="text" required pattern="[a-z0-9-]+"></div>
        <div class="field"><label for="g-type">Reason</label><select id="g-type"><option value="manual">manual</option><option value="promo">promo</option><option value="replacement">replacement</option></select></div>
        <div class="field"><label for="g-note">Note</label><input id="g-note" type="text" maxlength="200"></div>
        <div class="actions"><button class="btn" type="submit">Grant</button></div></form>` +
      search("entitlements", "Filter by email", "customer email") + table(["Email", "Product", "Source", "Status", "Granted", ""],
      res.data.entitlements.map((e) => `<tr><td>${escapeHTML(e.email)}</td><td>${escapeHTML(e.product_id)}</td><td>${escapeHTML(e.source_type)}</td><td>${escapeHTML(e.status)}</td><td>${escapeHTML(e.granted_at.slice(0, 10))}</td>
        <td>${e.status === "active" ? `<button class="link-btn" type="button" data-revoke="${escapeHTML(e.id)}">revoke</button>` : ""}</td></tr>`));
  }

  async function analytics() {
    const el = $("#admin-analytics");
    const res = await api("/api/admin/analytics?days=30");
    if (!res.ok) return fail(el, res);
    el.innerHTML = `<p class="small-print">Last 30 days, counted per day with no cookies or personal data.</p>` +
      table(["Event", "Item", "Count"], res.data.rows.map((r) => `<tr><td>${escapeHTML(r.event)}</td><td>${escapeHTML(r.subject || "—")}</td><td>${r.count}</td></tr>`));
  }

  addEventListener("gs:admin", () => {
    orders(); customers(); entitlements(); analytics();
    const root = $("#admin-app");
    root.addEventListener("click", async (e) => {
      const o = e.target.closest("[data-order]");
      if (o) return orderDetail(o.dataset.order);
      const r = e.target.closest("[data-resend]");
      if (r) {
        r.disabled = true;
        const res = await api(`/api/admin/orders/${encodeURIComponent(r.dataset.resend)}/resend`, { method: "POST", body: {} });
        r.nextElementSibling.textContent = res.ok ? `Receipt ${res.data.status}.` : res.error.message;
        return;
      }
      const v = e.target.closest("[data-revoke]");
      if (v && confirm("Revoke this access?")) {
        const reason = prompt("Reason (shown in the record):", "revoked by admin") || "revoked by admin";
        await api(`/api/admin/entitlements/${encodeURIComponent(v.dataset.revoke)}/revoke`, { method: "POST", body: { reason } });
        entitlements();
      }
    });
    root.addEventListener("submit", async (e) => {
      const form = e.target;
      if (form.dataset.search) {
        e.preventDefault();
        const q = $("input", form).value.trim();
        return { orders, customers, entitlements }[form.dataset.search](q);
      }
      if (form.hasAttribute("data-grant")) {
        e.preventDefault();
        const res = await api("/api/admin/entitlements", { method: "POST", body: { email: $("#g-email").value, productId: $("#g-product").value, sourceType: $("#g-type").value, note: $("#g-note").value } });
        if (res.ok) entitlements($("#g-email").value);
        else { const m = $(".msg", form); m.className = "msg error"; m.textContent = res.error.message; }
      }
    });
  });
})();

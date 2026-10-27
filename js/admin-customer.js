// Customer preview in the Customers tab: a read-only look at what one customer has (GET /api/admin/customers/<id>),
// opened by the "preview" buttons js/admin-records.js draws. Kept apart on purpose from the two actions under it:
// "Impersonate customer" (a recorded, time-limited session as them, js/impersonation.js shows the banner) and, in a
// test store only, "Test purchase" (the real checkout as them with test payments). Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, cents, api } = window.GS;
  const root = $("#admin-app");
  if (!root) return;
  // The products for the test-purchase list; loading starts on "gs:admin", and a preview waits for it.
  let products = Promise.resolve([]);

  const list = (items, empty) => (items.length ? `<ul>${items.join("")}</ul>` : `<p class="small-print">${empty}</p>`);
  const day = (iso) => e(String(iso || "").slice(0, 16).replace("T", " "));

  async function preview(userId) {
    const el = $("#customer-preview");
    el.innerHTML = `<p class="msg pending" role="status">Loading…</p>`;
    const res = await api(`/api/admin/customers/${encodeURIComponent(userId)}`);
    if (!res.ok) { el.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    const d = res.data, c = d.customer;
    const buyable = (await products).filter((p) => p.published && !p.salesPaused && !p.deleted && !p.free);
    el.innerHTML = `<div class="panel wide admin-preview" data-customer="${e(c.id)}">
      <h2 tabindex="-1" data-preview-heading>${e(c.email)}</h2><p class="small-print">Customer preview · read-only · ${e(c.name)} · ${c.verified ? "verified" : "not verified"} · joined ${day(c.createdAt)}</p>
      ${d.libraryNote ? `<p class="msg error">${e(d.libraryNote)}</p>` : ""}
      <h3>Library (what they see in Your Stacc)</h3>${list(d.library.map((p) => `<li>${e(p.title)} <span class="small-print">${e(p.type)}</span></li>`), "Nothing yet.")}
      <h3>Orders</h3>${list(d.orders.map((o) => `<li>${e(o.id)} · ${e(o.status)} · ${cents(o.totalCents, o.currency)} · ${day(o.createdAt)}${o.livemode ? "" : " · test"}${o.impersonationId ? " · placed by an admin" : ""}</li>`), "No orders.")}
      <h3>Entitlements</h3>${list(d.entitlements.map((x) => `<li>${e(x.productId)} · ${e(x.sourceType)} · ${e(x.status)}${x.revokeReason ? ` (${e(x.revokeReason)})` : ""}</li>`), "None.")}
      <h3>Recent downloads</h3>${list(d.downloads.map((x) => `<li>${day(x.at)} · ${e(x.event)} · ${e(x.productId || "")}${x.reason ? ` (${e(x.reason)})` : ""}${x.byAdmin ? " · by an admin" : ""}</li>`), "None.")}
      <h3>Follows</h3>${list(d.follows.map((f) => `<li>${e(f.projectId)}${f.autoStacc ? " · Auto-Stacc on" : ""}</li>`), "None.")}
      <h3>Impersonations</h3>${list(d.impersonations.map((i) => `<li>${day(i.startedAt)} · ${e(i.purpose)} · ${i.endedAt ? `ended ${day(i.endedAt)} (${e(i.endReason)})` : "open"}</li>`), "Never impersonated.")}
      ${d.canImpersonate ? `<div class="admin-danger">
        <h3>Impersonate customer</h3>
        <p>See the store exactly as ${e(c.email)} does, for up to 2 hours (30 min idle). Changes to their account, votes, follows and live payments stay blocked; everything you do is recorded under your name.</p>
        <label for="imp-note">Reason (for the audit log)</label><input id="imp-note" type="text" maxlength="200" placeholder="e.g. can't see their Pac">
        <div class="actions"><button class="btn danger" type="button" data-impersonate>Impersonate customer</button><span class="msg" role="status"></span></div></div>` : `<p class="small-print">Admin accounts can't be impersonated.</p>`}
      ${d.canImpersonate && d.testPurchases ? `<div class="admin-test">
        <h3>Test purchase <span class="admin-mode test"><strong>TEST</strong></span></h3>
        <p>Buy a product as this customer through the real checkout with test payments, then verify it in the Test purchases tab.</p>
        <label for="tp-product">Product</label><select id="tp-product" data-tp-product>${buyable.map((p) => `<option value="${e(p.id)}">${e(p.title)} · ${cents(p.priceCents, p.currency)}</option>`).join("")}</select>
        <div class="actions"><button class="btn" type="button" data-test-purchase ${buyable.length ? "" : "disabled"}>Start test purchase</button><span class="msg" role="status"></span></div></div>` : ""}
    </div>`;
    // It opens under the customer list (or from an order's details), so it is brought into view with focus on its heading.
    const h = $("[data-preview-heading]", el);
    h.scrollIntoView({ block: "start" });
    h.focus({ preventScroll: true });
  }

  async function go(btn, path, body) {
    if (btn.disabled) return;
    btn.disabled = true;
    const res = await api(path, { method: "POST", body });
    if (res.ok) return location.assign(res.data.redirect);
    btn.disabled = false;
    const msg = btn.nextElementSibling;
    msg.className = "msg error";
    msg.textContent = res.error.message;
  }

  // Listens at once: js/admin-records.js may draw the "preview" buttons before the products arrive, and a click on one
  // then must still open the preview.
  addEventListener("gs:admin", () => {
    products = api("/api/admin/products").then((res) => (res.ok ? res.data.products : []));
    root.addEventListener("click", async (ev) => {
      const p = ev.target.closest("[data-preview]");
      if (p) return preview(p.dataset.preview);
      const panel = ev.target.closest("[data-customer]");
      if (!panel) return;
      const id = encodeURIComponent(panel.dataset.customer);
      const imp = ev.target.closest("[data-impersonate]");
      if (imp && await window.GS.confirm("Start impersonating this customer? You'll see the store as them until you exit.")) {
        return go(imp, `/api/admin/customers/${id}/impersonate`, { note: $("#imp-note").value });
      }
      const tp = ev.target.closest("[data-test-purchase]");
      if (tp && await window.GS.confirm("Start a test purchase as this customer? You'll shop as them with test payments.")) {
        return go(tp, "/api/admin/test-purchases", { userId: panel.dataset.customer, productId: $("[data-tp-product]").value });
      }
    });
  });
})();

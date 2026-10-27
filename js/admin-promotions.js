// Control Center: the Promotions tab. Create a sale (lowers prices on its own while it runs) or a promo code (the
// buyer types it in the cart), see what's running, scheduled or ended with its paid orders and how much it took off,
// and end one. Talks to /api/admin/promotions; the store applies them (server/promotions). Starts on "gs:admin".
// Needs data/projects.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, cents, api } = window.GS;
  const root = $("#admin-app");
  if (!root) return;
  const PROJECTS = window.PROJECTS || [];
  let products = [];

  const when = (iso) => (iso ? e(new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })) : "no end");
  const offText = (p) => (p.percentOff ? `${p.percentOff}% off` : `${cents(p.amountOffCents, p.currency)} off`);
  const scopeText = (p) => (p.scope === "all" ? "everything" : p.scope === "project"
    ? p.scopeIds.map((id) => (PROJECTS.find((x) => x.id === id) || { name: id }).name).join(", ")
    : p.scopeIds.map((id) => (products.find((x) => x.id === id) || { title: id }).title).join(", "));

  function form() {
    const paid = products.filter((p) => !p.deleted && !p.free);
    return `<form class="panel wide admin-promo-form" data-promo-new><h2>New sale or promo code</h2>
      <fieldset class="admin-choice"><legend>Kind</legend>
        <label><input type="radio" name="kind" value="sale" checked> Sale: prices drop on their own while it runs</label>
        <label><input type="radio" name="kind" value="code"> Promo code: buyers enter it in the cart</label></fieldset>
      <div class="field"><label for="pr-name">Name (shown to buyers)</label><input id="pr-name" required maxlength="80" placeholder="e.g. Launch week"></div>
      <div class="field" data-for="code" hidden><label for="pr-code">Code</label><input id="pr-code" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_\\-]{2,31}" placeholder="e.g. LAUNCH20"></div>
      <fieldset class="admin-choice"><legend>Discount</legend>
        <label><input type="radio" name="off" value="percent" checked> Percent</label><label><input type="radio" name="off" value="amount"> Amount</label>
        <label class="sr-only" for="pr-value">Discount value</label><input id="pr-value" type="number" min="1" max="90" step="1" required>
        <span class="small-print" data-off-hint>1–90%. A sale never takes a price below $0.50, a code never takes an order below $0.50.</span></fieldset>
      <fieldset class="admin-choice"><legend>Applies to</legend>
        <label><input type="radio" name="scope" value="all" checked> Everything</label><label><input type="radio" name="scope" value="products"> Some products</label>
        <label><input type="radio" name="scope" value="project"> A project</label>
        <div data-for="products" hidden>${paid.map((p) => `<label><input type="checkbox" name="product" value="${e(p.id)}"> ${e(p.title)} <span class="small-print">${cents(p.listPriceCents ?? p.priceCents, p.currency)}</span></label>`).join("")}</div>
        <div data-for="project" hidden><label class="sr-only" for="pr-project">Project</label><select id="pr-project">${PROJECTS.map((p) => `<option value="${e(p.id)}">${e(p.name)}</option>`).join("")}</select></div></fieldset>
      <div class="field"><label for="pr-start">Starts (your time; empty = now)</label><input id="pr-start" type="datetime-local"></div>
      <div class="field"><label for="pr-end">Ends (empty = until you end it)</label><input id="pr-end" type="datetime-local"></div>
      <div data-for="code" hidden>
        <div class="field"><label for="pr-max">Total uses (empty = no limit)</label><input id="pr-max" type="number" min="1" step="1"></div>
        <label><input type="checkbox" id="pr-once"> Once per customer (by email)</label></div>
      <p class="msg" role="status"></p><div class="actions"><button class="btn" type="submit">Create</button></div></form>`;
  }

  function sync(f) {
    const kind = $("input[name=kind]:checked", f).value;
    const scope = $("input[name=scope]:checked", f).value;
    const percent = $("input[name=off]:checked", f).value === "percent";
    f.querySelectorAll("[data-for=code]").forEach((el) => (el.hidden = kind !== "code"));
    $("#pr-code", f).required = kind === "code";
    $("[data-for=products]", f).hidden = scope !== "products";
    $("[data-for=project]", f).hidden = scope !== "project";
    Object.assign($("#pr-value", f), percent ? { max: 90, step: 1 } : { max: 100000, step: 0.01 });
    $("[data-off-hint]", f).textContent = percent ? "1–90%. A sale never takes a price below $0.50, a code never takes an order below $0.50." : "Dollars off (per item for a sale, per order for a code).";
  }

  // pending: a promotions request already on its way (the first draw starts it beside the products request).
  async function draw(pending) {
    const el = $("#admin-promotions");
    const res = await (pending || api("/api/admin/promotions"));
    if (!res.ok) { el.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    const rows = res.data.promotions.map((p) => `<tr data-status="${e(p.status)}"><td><strong>${e(p.name)}</strong>${p.code ? ` <code>${e(p.code)}</code>` : ""}</td>
      <td>${p.kind === "sale" ? "sale" : "code"}</td><td>${e(offText(p))}</td><td>${e(scopeText(p))}</td><td>${e(p.status)}</td>
      <td>${when(p.startsAt)} → ${when(p.endsAt)}</td>
      <td>${p.paidOrders}${p.maxRedemptions ? ` / ${p.maxRedemptions}` : ""}${p.oncePerCustomer ? " · once each" : ""}</td><td>${cents(p.discountCents, p.currency)}</td>
      <td>${p.status === "ended" ? "" : `<button class="link-btn" type="button" data-promo-end="${e(p.id)}">${p.status === "scheduled" ? "cancel" : "end now"}</button>`}</td></tr>`);
    el.innerHTML = form() + `<div class="admin-table"><table><thead><tr><th scope="col">Promotion</th><th scope="col">Kind</th><th scope="col">Discount</th>
      <th scope="col">On</th><th scope="col">Status</th><th scope="col">When</th><th scope="col">Paid orders</th><th scope="col">Taken off</th><th scope="col"></th></tr></thead>
      <tbody>${rows.join("") || `<tr><td colspan="9">No sales or codes yet.</td></tr>`}</tbody></table></div>
      <p class="small-print">Prices on the static pages and in search results stay the catalog price; the store's live price (cards, product pages, cart, checkout) shows the sale.</p>`;
    sync($("[data-promo-new]", el));
  }

  async function create(f) {
    const btn = $("button[type=submit]", f), msg = $(".msg", f);
    if (btn.disabled) return;
    const kind = $("input[name=kind]:checked", f).value;
    const scope = $("input[name=scope]:checked", f).value;
    const value = Number($("#pr-value", f).value);
    const iso = (v) => (v ? new Date(v).toISOString() : undefined);
    const body = {
      kind, name: $("#pr-name", f).value.trim(), code: kind === "code" ? $("#pr-code", f).value.trim() : undefined, scope,
      ...($("input[name=off]:checked", f).value === "percent" ? { percentOff: Math.round(value) } : { amountOffCents: Math.round(value * 100) }),
      scopeIds: scope === "products" ? [...f.querySelectorAll("input[name=product]:checked")].map((x) => x.value) : scope === "project" ? [$("#pr-project", f).value] : [],
      startsAt: iso($("#pr-start", f).value), endsAt: iso($("#pr-end", f).value),
      ...(kind === "code" && { maxRedemptions: $("#pr-max", f).value ? Number($("#pr-max", f).value) : undefined, oncePerCustomer: $("#pr-once", f).checked })
    };
    btn.disabled = true;
    const res = await api("/api/admin/promotions", { method: "POST", body });
    btn.disabled = false;
    if (res.ok) return draw();
    msg.className = "msg error";
    msg.textContent = res.error.message;
  }

  addEventListener("gs:admin", async () => {
    const promotions = api("/api/admin/promotions");
    const res = await api("/api/admin/products");
    products = res.ok ? res.data.products : [];
    draw(promotions);
    root.addEventListener("change", (ev) => { const f = ev.target.closest("[data-promo-new]"); if (f) sync(f); });
    root.addEventListener("submit", (ev) => {
      if (!ev.target.matches("[data-promo-new]")) return;
      ev.preventDefault();
      create(ev.target);
    });
    root.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-promo-end]");
      if (!b || b.disabled || !await window.GS.confirm("End this now? Orders already placed keep their discount.")) return;
      b.disabled = true;
      await api(`/api/admin/promotions/${encodeURIComponent(b.dataset.promoEnd)}/end`, { method: "POST", body: {} });
      draw();
    });
  });
})();

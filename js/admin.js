// Control Center shell and catalog tools: checks access (the API answers 404 to non-admins), draws the LIVE/TEST
// badge, the tabs and the summary, and manages products: pause/resume sales, upload paid files (or a new version of
// one) and preview clips, deactivate files. The other tabs start on the "gs:admin" event: statistics
// (js/admin-stats.js), orders, customers and entitlements (js/admin-records.js), customer preview with impersonation
// and test purchases (js/admin-customer.js), sales and promo codes (js/admin-promotions.js), creators
// (js/admin-creators.js), test-purchase checks and the audit log (js/admin-audit.js).
// Needs data/product-types.js, data/pacs.js, data/content-types.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, cents, api } = window.GS;
  const root = $("#admin-app");
  if (!root) return;
  const TYPES = window.PRODUCT_TYPES || {};
  const PACS = window.PACS || [];
  const KINDS = window.CONTENT_TYPES || {};
  const pacTitle = (id) => (PACS.find((x) => x.id === id) || { title: id }).title;
  const TABS = [["overview", "Overview"], ["products", "Products"], ["orders", "Orders"], ["customers", "Customers"], ["entitlements", "Entitlements"],
    ["promotions", "Promotions"], ["creators", "Creators"], ["payouts", "Payouts"], ["tests", "Test purchases"], ["audit", "Audit log"]];
  const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

  function shell(s) {
    const paid = (s.orders.find((o) => o.status === "paid") || { n: 0, cents: 0 });
    root.innerHTML = `
      <p class="admin-mode ${s.livePayments ? "live" : "test"}"><strong>${s.livePayments ? "LIVE" : "TEST"}</strong>
        ${s.livePayments ? "Real payments. Test purchases are off here." : "Test payments only: nothing here is real revenue."}</p>
      <p class="msg">${escapeHTML(s.environment)} · payments: ${escapeHTML(s.paymentProvider)} · ${s.products} products · ${s.customers} customers · ${paid.n} paid orders (${cents(paid.cents || 0)}) · ${s.activeEntitlements} active entitlements</p>
      ${s.alerts.length ? `<div class="msg error" role="alert">Payment events that need a look (check them in Stripe too):<ul>${s.alerts.map((a) => `<li>${escapeHTML(a.received_at.slice(0, 16).replace("T", " "))} ${escapeHTML(a.type)} → ${escapeHTML(a.outcome)}${a.detail ? `: ${escapeHTML(a.detail)}` : ""}${a.order_id ? ` (${escapeHTML(a.order_id)})` : ""}</li>`).join("")}</ul></div>` : ""}
      <label class="admin-section"><span>Section</span><select data-section aria-label="Section">${TABS.map(([k, l], i) => `<option value="${k}"${i === 0 ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <div class="admin-tabs" role="tablist">${TABS.map(([k, l], i) => `<button type="button" role="tab" id="tab-${k}" aria-controls="admin-${k}" aria-selected="${i === 0}">${l}</button>`).join("")}</div>
      ${TABS.map(([k], i) => `<div class="admin-panel" role="tabpanel" id="admin-${k}" aria-labelledby="tab-${k}"${i ? " hidden" : ""}></div>`).join("")}`;
  }

  function selectTab(key) {
    TABS.forEach(([k]) => {
      $(`#tab-${k}`).setAttribute("aria-selected", String(k === key));
      $(`#admin-${k}`).hidden = k !== key;
    });
    const pick = $("[data-section]", root);
    if (pick) pick.value = key;
  }

  async function products() {
    const panel = $("#admin-products");
    const res = await api("/api/admin/products");
    if (!res.ok) { panel.innerHTML = `<p class="msg error">${escapeHTML(res.error.message)}</p>`; return; }
    panel.innerHTML = `
      <p class="small-print">Here you can change a price, take a product out of draft or hide it, remove it, pause sales, and manage its paid files. Titles and descriptions still live in data/products.js. Changes here are kept when the site is redeployed.</p>
      <form class="panel wide" data-preview-upload><h2>Preview clip</h2>
        <p>Upload an audio clip (MP3/M4A/OGG/WAV, under 20 MB), then set <code>preview: { file: "name.mp3" }</code> on the product in data/products.js.</p>
        <div class="field"><label for="preview-file">Audio file</label><input id="preview-file" type="file" accept="audio/*" required></div>
        <p class="msg" role="status"></p><div class="actions"><button class="btn" type="submit">Upload preview</button></div></form>
      <ul class="admin-list">${res.data.products.map((p) => `<li class="admin-product" data-product="${escapeHTML(p.id)}">
        <div class="admin-row"><strong>${escapeHTML(p.title)}</strong><span class="tag">${escapeHTML((TYPES[p.type] || {}).label || p.type)}</span>
          <span class="price">${p.free ? "Free" : cents(p.priceCents, p.currency)}</span>
          <span class="admin-flags">${p.deleted ? "removed" : p.published ? "published" : "draft"}${p.salesPaused ? " · sales paused" : ""}</span>
          ${p.deleted ? `<button class="btn ghost" type="button" data-product-set='{"deleted":false}'>Restore</button>` : `<button class="btn ghost" type="button" data-pause="${p.salesPaused ? "0" : "1"}">${p.salesPaused ? "Resume sales" : "Pause sales"}</button>
          <button class="btn ghost" type="button" data-product-set='{"published":${p.published ? "false" : "true"}}'>${p.published ? "Hide from store" : "Publish (out of draft)"}</button>
          <button class="btn ghost" type="button" data-product-remove>Remove</button>`}</div>
        ${p.deleted ? "" : `<form class="admin-upload" data-price-form><label for="pr-${escapeHTML(p.id)}">Price (${escapeHTML(p.currency)}, 0 = free)</label>
          <input id="pr-${escapeHTML(p.id)}" type="number" min="0" max="10000" step="0.01" inputmode="decimal" value="${(p.priceCents / 100).toFixed(2)}" required>
          <button class="btn ghost" type="submit">Save price</button><span class="small-print" role="status"></span></form>`}
        <ul class="admin-files">${p.files.map((f) => `<li${f.active ? "" : ' class="inactive"'}>${escapeHTML(f.label || f.filename)} <span class="small-print">${escapeHTML(f.filename)} · ${size(f.size_bytes)}${f.pac_id ? ` · ${escapeHTML(pacTitle(f.pac_id))}` : ""}${f.kind ? ` · ${escapeHTML((KINDS[f.kind] || {}).label || f.kind)}` : ""}${f.active ? (f.status && f.status !== "published" ? ` · <strong>${escapeHTML(f.status)}</strong>` : "") : " · deactivated"}</span>
          ${f.active && f.status === "pending" ? `<button class="link-btn" type="button" data-publish-file="${escapeHTML(f.id)}">publish</button>` : ""}
          ${f.active ? `<button class="link-btn" type="button" data-remove-file="${escapeHTML(f.id)}">deactivate</button>` : ""}</li>`).join("") || "<li class=\"small-print\">No files yet: buyers would get an empty library entry.</li>"}</ul>
        <form class="admin-upload" data-upload>
          <label class="sr-only" for="f-${escapeHTML(p.id)}">File for ${escapeHTML(p.title)}</label><input id="f-${escapeHTML(p.id)}" type="file" required>
          <label class="sr-only" for="l-${escapeHTML(p.id)}">Label</label><input id="l-${escapeHTML(p.id)}" type="text" placeholder="Label (e.g. WAV stems)" maxlength="120">
          ${p.pacs.length ? `<label class="sr-only" for="p-${escapeHTML(p.id)}">Pac</label><select id="p-${escapeHTML(p.id)}" data-pac><option value="">No Pac</option>${p.pacs.map((id) => `<option value="${escapeHTML(id)}">${escapeHTML(pacTitle(id))}</option>`).join("")}</select>` : ""}
          ${p.files.some((f) => f.active) ? `<label class="sr-only" for="r-${escapeHTML(p.id)}">Replaces</label><select id="r-${escapeHTML(p.id)}" data-replaces><option value="">New file</option>${p.files.filter((f) => f.active).map((f) => `<option value="${escapeHTML(f.id)}">New version of ${escapeHTML(f.label || f.filename)}</option>`).join("")}</select>` : ""}
          <label class="sr-only" for="k-${escapeHTML(p.id)}">Content type</label><select id="k-${escapeHTML(p.id)}" data-kind><option value="">Type from file name</option>${Object.entries(KINDS).map(([k, t]) => `<option value="${escapeHTML(k)}">${escapeHTML(t.label)}</option>`).join("")}</select>
          <label class="admin-hold"><input type="checkbox" data-hold> Hold back until I publish it</label>
          <button class="btn" type="submit">Upload file</button><span class="msg" role="status"></span></form>
      </li>`).join("")}</ul>`;
  }

  // Raw PUT of the file bytes; the store keeps it private and lists it for owners.
  async function upload(url, file, msg) {
    msg.className = "msg pending";
    msg.textContent = `Uploading ${file.name}…`;
    try {
      const res = await fetch(url, { method: "PUT", body: file, credentials: "same-origin", headers: { "Content-Type": file.type || "application/octet-stream" } });
      const data = await res.json().catch(() => ({}));
      msg.className = res.ok ? "msg" : "msg error";
      msg.textContent = res.ok ? `Uploaded ${file.name}${data.path ? ` → ${data.path}` : ""}` : (data.error || {}).message || "Upload failed.";
      return res.ok;
    } catch {
      msg.className = "msg error";
      msg.textContent = "Upload interrupted. Try again.";
      return false;
    }
  }

  root.addEventListener("submit", async (e) => {
    const form = e.target;
    if (form.matches("[data-price-form]")) {
      e.preventDefault();
      const btn = $("button[type=submit]", form), note = $("[role=status]", form);
      const priceCents = Math.round(Number($("input", form).value) * 100);
      if (btn.disabled || !Number.isInteger(priceCents) || priceCents < 0) { note.textContent = "Enter a price like 9.99."; return; }
      btn.disabled = true;
      const res = await api(`/api/admin/products/${encodeURIComponent(form.closest("[data-product]").dataset.product)}`, { method: "PATCH", body: { priceCents } });
      if (res.ok) return products();
      btn.disabled = false;
      note.textContent = res.error.message;
      return;
    }
    if (!form.matches("[data-upload], [data-preview-upload]")) return;
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    if (btn.disabled) return;
    const file = $("input[type=file]", form).files[0];
    if (!file) return;
    btn.disabled = true;
    if (form.hasAttribute("data-preview-upload")) {
      await upload(`/api/admin/previews?filename=${encodeURIComponent(file.name)}`, file, $(".msg", form));
    } else {
      const id = form.closest("[data-product]").dataset.product;
      const label = $("input[type=text]", form).value;
      const pac = $("[data-pac]", form) ? $("[data-pac]", form).value : "";
      const kind = $("[data-kind]", form).value;
      const replaces = $("[data-replaces]", form) ? $("[data-replaces]", form).value : "";
      const hold = $("[data-hold]", form).checked;
      const query = new URLSearchParams({ filename: file.name, label, ...(pac && { pac }), ...(kind && { kind }), ...(replaces && { replaces }), ...(hold && { status: "pending" }) });
      if (await upload(`/api/admin/products/${encodeURIComponent(id)}/files?${query}`, file, $(".msg", form))) products();
    }
    btn.disabled = false;
  });

  root.addEventListener("change", (e) => {
    const pick = e.target.closest("[data-section]");
    if (pick) selectTab(pick.value);
  });

  root.addEventListener("click", async (e) => {
    const tab = e.target.closest("[role=tab]");
    if (tab) return selectTab(tab.id.slice(4));
    const set = e.target.closest("[data-product-set]");
    if (set) {
      set.disabled = true;
      await api(`/api/admin/products/${encodeURIComponent(set.closest("[data-product]").dataset.product)}`, { method: "PATCH", body: JSON.parse(set.dataset.productSet) });
      return products();
    }
    // Removing hides the product and stops sales; people who already bought it keep their files. It can be restored.
    const rmProduct = e.target.closest("[data-product-remove]");
    if (rmProduct) {
      const li = rmProduct.closest("[data-product]");
      if (!confirm(`Remove "${li.querySelector("strong").textContent}" from the store? People who already bought it keep their files. You can restore it later.`)) return;
      rmProduct.disabled = true;
      await api(`/api/admin/products/${encodeURIComponent(li.dataset.product)}`, { method: "PATCH", body: { deleted: true } });
      return products();
    }
    const pause = e.target.closest("[data-pause]");
    if (pause) {
      pause.disabled = true;
      await api(`/api/admin/products/${encodeURIComponent(pause.closest("[data-product]").dataset.product)}`, { method: "PATCH", body: { salesPaused: pause.dataset.pause === "1" } });
      return products();
    }
    // A pending file (uploaded with "hold back") reaches owners only once published.
    const pub = e.target.closest("[data-publish-file]");
    if (pub) {
      pub.disabled = true;
      await api(`/api/admin/files/${encodeURIComponent(pub.dataset.publishFile)}`, { method: "PATCH", body: { status: "published" } });
      return products();
    }
    const rm = e.target.closest("[data-remove-file]");
    if (rm && confirm("Deactivate this file? Owners lose the download link; the file stays in storage.")) {
      await api(`/api/admin/files/${encodeURIComponent(rm.dataset.removeFile)}`, { method: "DELETE" });
      products();
    }
  });

  (async () => {
    const res = await api("/api/admin/summary");
    if (res.status === 401) { location.replace("/login?next=/admin"); return; }
    if (!res.ok) { root.innerHTML = `<p class="msg error">Nothing here.</p>`; return; }
    shell(res.data);
    products();
    dispatchEvent(new CustomEvent("gs:admin", { detail: res.data }));
  })();
})();

// Admin page shell and catalog tools: checks access (the API answers 404 to non-admins), draws the tabs and the
// summary, and manages products: pause/resume sales, upload paid files and preview clips, deactivate files.
// Orders, customers, entitlements and analytics are js/admin-records.js, started by the "gs:admin" event.
// Needs data/product-types.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, cents, api } = window.GS;
  const root = $("#admin-app");
  if (!root) return;
  const TYPES = window.PRODUCT_TYPES || {};
  const TABS = [["products", "Products"], ["orders", "Orders"], ["customers", "Customers"], ["entitlements", "Entitlements"], ["analytics", "Analytics"]];
  const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

  function shell(s) {
    const paid = (s.orders.find((o) => o.status === "paid") || { n: 0, cents: 0 });
    root.innerHTML = `
      <p class="msg">${escapeHTML(s.environment)} · payments: ${escapeHTML(s.paymentProvider)} · ${s.products} products · ${s.customers} customers · ${paid.n} paid orders (${cents(paid.cents || 0)}) · ${s.activeEntitlements} active entitlements</p>
      <div class="admin-tabs" role="tablist">${TABS.map(([k, l], i) => `<button type="button" role="tab" id="tab-${k}" aria-controls="admin-${k}" aria-selected="${i === 0}">${l}</button>`).join("")}</div>
      ${TABS.map(([k], i) => `<div class="admin-panel" role="tabpanel" id="admin-${k}" aria-labelledby="tab-${k}"${i ? " hidden" : ""}></div>`).join("")}`;
  }

  function selectTab(key) {
    TABS.forEach(([k]) => {
      $(`#tab-${k}`).setAttribute("aria-selected", String(k === key));
      $(`#admin-${k}`).hidden = k !== key;
    });
  }

  async function products() {
    const panel = $("#admin-products");
    const res = await api("/api/admin/products");
    if (!res.ok) { panel.innerHTML = `<p class="msg error">${escapeHTML(res.error.message)}</p>`; return; }
    panel.innerHTML = `
      <p class="small-print">Titles, prices and descriptions live in data/products.js (edit, run the build, deploy). Here: sales switch, paid files, previews.</p>
      <form class="panel wide" data-preview-upload><h2>Preview clip</h2>
        <p>Upload an audio clip (MP3/M4A/OGG/WAV, under 20 MB), then set <code>preview: { file: "name.mp3" }</code> on the product in data/products.js.</p>
        <div class="field"><label for="preview-file">Audio file</label><input id="preview-file" type="file" accept="audio/*" required></div>
        <p class="msg" role="status"></p><div class="actions"><button class="btn" type="submit">Upload preview</button></div></form>
      <ul class="admin-list">${res.data.products.map((p) => `<li class="admin-product" data-product="${escapeHTML(p.id)}">
        <div class="admin-row"><strong>${escapeHTML(p.title)}</strong><span class="tag">${escapeHTML((TYPES[p.type] || {}).label || p.type)}</span>
          <span class="price">${p.free ? "Free" : cents(p.priceCents, p.currency)}</span>
          <span class="admin-flags">${p.deleted ? "removed" : p.published ? "published" : "draft"}${p.salesPaused ? " · sales paused" : ""}</span>
          ${p.deleted ? "" : `<button class="btn ghost" type="button" data-pause="${p.salesPaused ? "0" : "1"}">${p.salesPaused ? "Resume sales" : "Pause sales"}</button>`}</div>
        <ul class="admin-files">${p.files.map((f) => `<li${f.active ? "" : ' class="inactive"'}>${escapeHTML(f.label || f.filename)} <span class="small-print">${escapeHTML(f.filename)} · ${size(f.size_bytes)}${f.active ? "" : " · deactivated"}</span>
          ${f.active ? `<button class="link-btn" type="button" data-remove-file="${escapeHTML(f.id)}">deactivate</button>` : ""}</li>`).join("") || "<li class=\"small-print\">No files yet: buyers would get an empty library entry.</li>"}</ul>
        <form class="admin-upload" data-upload>
          <label class="sr-only" for="f-${escapeHTML(p.id)}">File for ${escapeHTML(p.title)}</label><input id="f-${escapeHTML(p.id)}" type="file" required>
          <label class="sr-only" for="l-${escapeHTML(p.id)}">Label</label><input id="l-${escapeHTML(p.id)}" type="text" placeholder="Label (e.g. WAV stems)" maxlength="120">
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
    e.preventDefault();
    const form = e.target;
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
      if (await upload(`/api/admin/products/${encodeURIComponent(id)}/files?filename=${encodeURIComponent(file.name)}&label=${encodeURIComponent(label)}`, file, $(".msg", form))) products();
    }
    btn.disabled = false;
  });

  root.addEventListener("click", async (e) => {
    const tab = e.target.closest("[role=tab]");
    if (tab) return selectTab(tab.id.slice(4));
    const pause = e.target.closest("[data-pause]");
    if (pause) {
      pause.disabled = true;
      await api(`/api/admin/products/${encodeURIComponent(pause.closest("[data-product]").dataset.product)}`, { method: "PATCH", body: { salesPaused: pause.dataset.pause === "1" } });
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
    dispatchEvent(new CustomEvent("gs:admin"));
  })();
})();

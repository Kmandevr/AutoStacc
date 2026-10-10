// Control Center shell and catalog tools: checks access (the API answers 404 to non-admins), draws the workspace shell
// (js/workspace.js, sections from data/workspaces.js) with LIVE/TEST in its header and the summary, and manages products: pause/resume sales, upload paid files (or a new version of
// one) and preview clips, deactivate files. The other tabs start on the "gs:admin" event: statistics
// (js/admin-stats.js), orders, customers and entitlements (js/admin-records.js), customer preview with impersonation
// and test purchases (js/admin-customer.js), sales and promo codes (js/admin-promotions.js), creators
// (js/admin-creators.js), payouts (js/admin-payouts.js), AutoStacc news (js/admin-news.js), the Pack Builder (js/admin-packs.js), test-purchase checks and the audit log (js/admin-audit.js).
// Needs data/workspaces.js, data/product-types.js, data/pacs.js, data/content-types.js, js/util.js and js/workspace.js.
(function () {
  "use strict";

  const { $, escapeHTML, cents, api } = window.GS;
  const root = $("#admin-app");
  if (!root) return;
  const TYPES = window.PRODUCT_TYPES || {};
  const PACS = window.PACS || [];
  const KINDS = window.CONTENT_TYPES || {};
  const pacTitle = (id) => (PACS.find((x) => x.id === id) || { title: id }).title;
  // Sections and their groups come from data/workspaces.js; optional features switched off (data/features.js) leave none behind.
  const GROUPS = ((window.WORKSPACES || {}).control || { groups: [] }).groups
    .map((g) => ({ ...g, items: g.items.filter((it) => it.key !== "packs" || (window.FEATURES || {})["packs.builder"] !== false) }))
    .filter((g) => g.items.length);
  const KEYS = GROUPS.flatMap((g) => g.items.map((it) => it.key));
  const LABEL = Object.fromEntries(GROUPS.flatMap((g) => g.items.map((it) => [it.key, it.label])));
  const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
  let ws = null;

  // The workspace shell (js/workspace.js): LIVE or TEST in the header, the environment under the title, the figures and
  // payment alerts above every section, and one panel per section (#admin-<key>, which each tab's own script fills).
  function shell(s) {
    const paid = (s.orders.find((o) => o.status === "paid") || { n: 0, cents: 0 });
    ws = window.GS.workspace.mount(root, {
      label: "Control Center", title: "AutoStacc store",
      subtitle: `${s.environment} · ${s.livePayments ? "Real payments. Test purchases are off here." : "Test payments only: nothing here is real revenue."}`,
      status: { text: s.livePayments ? "LIVE" : "TEST", tone: s.livePayments ? "danger" : "good" },
      groups: GROUPS, current: KEYS[0],
      onSelect: (key) => show(key)
    });
    ws.body.innerHTML = `
      <ul class="admin-kpis" aria-label="Store at a glance">${[["Environment", s.environment], ["Payments", s.paymentProvider], ["Products", s.products], ["Customers", s.customers],
        ["Paid orders", `${paid.n} · ${cents(paid.cents || 0)}`], ["Active entitlements", s.activeEntitlements]]
        .map(([k, v]) => `<li><span>${k}</span><strong>${escapeHTML(String(v))}</strong></li>`).join("")}</ul>
      ${s.alerts.length ? `<div class="msg error" role="alert">Payment events that need a look (check them in Stripe too):<ul>${s.alerts.map((a) => `<li>${escapeHTML(a.received_at.slice(0, 16).replace("T", " "))} ${escapeHTML(a.type)} → ${escapeHTML(a.outcome)}${a.detail ? `: ${escapeHTML(a.detail)}` : ""}${a.order_id ? ` (${escapeHTML(a.order_id)})` : ""}</li>`).join("")}</ul></div>` : ""}
      ${KEYS.map((k, i) => `<section class="admin-section" data-admin-section="${k}" aria-labelledby="admin-h-${k}"${i ? " hidden" : ""}>
        <h2 class="admin-section-title" id="admin-h-${k}" tabindex="-1" data-ws-heading>${escapeHTML(LABEL[k])}</h2>
        <div class="admin-panel" id="admin-${k}"></div></section>`).join("")}`;
  }

  // The open section lives in the address (/admin#orders), so a reload or a shared link lands on it.
  function show(key) {
    root.querySelectorAll("[data-admin-section]").forEach((el) => { el.hidden = el.dataset.adminSection !== key; });
    if (location.hash.slice(1) !== key) history.replaceState(null, "", key === KEYS[0] ? location.pathname : `#${key}`);
  }
  const selectTab = (key, focus) => ws.select(KEYS.includes(key) ? key : KEYS[0], { focus });

  // A product action that didn't go through says so beside the product instead of failing silently.
  const act = async (el, path, body) => {
    const res = await api(path, { method: "PATCH", body });
    if (!res.ok) {
      el.disabled = false;
      const row = el.closest("[data-product]");
      let msg = $(".admin-row-error", row);
      if (!msg) { msg = document.createElement("p"); msg.className = "msg error admin-row-error"; msg.setAttribute("role", "alert"); row.append(msg); }
      msg.textContent = res.error.message;
      return;
    }
    products();
  };

  async function products() {
    const panel = $("#admin-products");
    const res = await api("/api/admin/products");
    if (!res.ok) { panel.innerHTML = `<p class="msg error">${escapeHTML(res.error.message)}</p>`; return; }
    panel.innerHTML = `
      <p class="small-print">Here you can change a price, title or description, take a product out of draft or hide it, remove it, pause sales, and manage its paid files (hold back, publish, reject or deactivate). Changes here are kept when the site is redeployed; product pages and search data still show data/products.js until it is updated.</p>
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
          ${p.published ? `<button class="btn ghost" type="button" data-announce title="Email the project's followers who want new-release emails">Email followers</button>` : ""}
          <button class="btn ghost danger" type="button" data-product-remove>Remove</button>`}<span class="small-print" role="status" data-announce-msg></span></div>
        ${p.deleted ? "" : `<form class="admin-upload" data-price-form><label for="pr-${escapeHTML(p.id)}">Price (${escapeHTML(p.currency)}, 0 = free)</label>
          <input id="pr-${escapeHTML(p.id)}" type="number" min="0" max="10000" step="0.01" inputmode="decimal" value="${(p.priceCents / 100).toFixed(2)}" required>
          <button class="btn ghost" type="submit">Save price</button><span class="small-print" role="status"></span></form>
        <details class="admin-edit"><summary>Edit title and description</summary><form class="admin-upload" data-text-form>
          <label for="t-${escapeHTML(p.id)}">Title</label><input id="t-${escapeHTML(p.id)}" type="text" minlength="3" maxlength="80" value="${escapeHTML(p.title)}" required data-title>
          <label for="d-${escapeHTML(p.id)}">Description</label><textarea id="d-${escapeHTML(p.id)}" rows="4" maxlength="2000" data-description>${escapeHTML(p.description || "")}</textarea>
          <button class="btn ghost" type="submit">Save text</button><span class="small-print" role="status"></span></form></details>`}
        <ul class="admin-files">${p.files.map((f) => `<li${f.active ? "" : ' class="inactive"'}>${escapeHTML(f.label || f.filename)} <span class="small-print">${escapeHTML(f.filename)} · ${size(f.size_bytes)}${f.pac_id ? ` · ${escapeHTML(pacTitle(f.pac_id))}` : ""}${f.kind ? ` · ${escapeHTML((KINDS[f.kind] || {}).label || f.kind)}` : ""}${f.active ? (f.status && f.status !== "published" ? ` · <strong>${escapeHTML(f.status)}</strong>` : "") : " · deactivated"}</span>
          ${f.active && f.status === "pending" ? `<button class="link-btn" type="button" data-publish-file="${escapeHTML(f.id)}">publish</button>` : ""}
          ${f.active && f.status !== "rejected" ? `<button class="link-btn danger" type="button" data-reject-file="${escapeHTML(f.id)}">reject</button>` : ""}
          ${f.active ? `<button class="link-btn danger" type="button" data-remove-file="${escapeHTML(f.id)}">deactivate</button>` : ""}</li>`).join("") || "<li class=\"small-print\">No files yet: buyers would get an empty library entry.</li>"}</ul>
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
    if (form.matches("[data-text-form]")) {
      e.preventDefault();
      const btn = $("button[type=submit]", form), note = $("[role=status]", form);
      if (btn.disabled) return;
      btn.disabled = true;
      const body = { title: $("[data-title]", form).value, description: $("[data-description]", form).value };
      const res = await api(`/api/admin/products/${encodeURIComponent(form.closest("[data-product]").dataset.product)}`, { method: "PATCH", body });
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

  root.addEventListener("click", async (e) => {
    const set = e.target.closest("[data-product-set]");
    if (set) {
      set.disabled = true;
      return act(set, `/api/admin/products/${encodeURIComponent(set.closest("[data-product]").dataset.product)}`, JSON.parse(set.dataset.productSet));
    }
    // Removing hides the product and stops sales; people who already bought it keep their files. It can be restored.
    const rmProduct = e.target.closest("[data-product-remove]");
    if (rmProduct) {
      const li = rmProduct.closest("[data-product]");
      if (!confirm(`Remove "${li.querySelector("strong").textContent}" from the store? People who already bought it keep their files. You can restore it later.`)) return;
      rmProduct.disabled = true;
      return act(rmProduct, `/api/admin/products/${encodeURIComponent(li.dataset.product)}`, { deleted: true });
    }
    const pause = e.target.closest("[data-pause]");
    if (pause) {
      pause.disabled = true;
      return act(pause, `/api/admin/products/${encodeURIComponent(pause.closest("[data-product]").dataset.product)}`, { salesPaused: pause.dataset.pause === "1" });
    }
    // Tells the project's followers who want new-release emails, in batches; each person once per product.
    const announce = e.target.closest("[data-announce]");
    if (announce && !announce.disabled) {
      const li = announce.closest("[data-product]"), msg = $("[data-announce-msg]", li);
      if (!confirm(`Email "${li.querySelector("strong").textContent}" to its project's followers? Each follower gets it once.`)) return;
      announce.disabled = true;
      let total = 0;
      for (;;) {
        const res = await api(`/api/admin/products/${encodeURIComponent(li.dataset.product)}/announce`, { method: "POST", body: {} });
        if (!res.ok) { msg.textContent = res.error.message; break; }
        total += res.data.sent;
        msg.textContent = res.data.left ? `Sent ${total}, ${res.data.left} left…` : `Sent to ${total} follower${total === 1 ? "" : "s"}.`;
        if (!res.data.left || !res.data.sent) break;
      }
      announce.disabled = false;
      return;
    }
    // A pending file (uploaded with "hold back") reaches owners only once published.
    const pub = e.target.closest("[data-publish-file]");
    if (pub) {
      pub.disabled = true;
      await api(`/api/admin/files/${encodeURIComponent(pub.dataset.publishFile)}`, { method: "PATCH", body: { status: "published" } });
      return products();
    }
    // Rejecting takes a file away from owners for good (a creator's product with no file left goes back to draft).
    const rej = e.target.closest("[data-reject-file]");
    if (rej) {
      const note = prompt("Reject this file? Owners lose it and it can't be published again. Reason (optional; a creator sees it in the Studio):");
      if (note === null) return;
      rej.disabled = true;
      await api(`/api/admin/files/${encodeURIComponent(rej.dataset.rejectFile)}`, { method: "PATCH", body: { status: "rejected", ...(note.trim() && { note: note.trim() }) } });
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
    selectTab(location.hash.slice(1));
    addEventListener("hashchange", () => selectTab(location.hash.slice(1)));
  })();
})();

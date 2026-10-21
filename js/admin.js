// Control Center shell and product moderation: checks access (the API answers 404 to non-admins), draws the workspace
// shell (js/workspace.js, sections from data/workspaces.js) with LIVE/TEST in its header and the summary, and moderates
// every product (made by its creator in the Studio): pause/resume sales, hide or show, remove or restore, and its paid
// files (upload one or a new version, hold back, publish, reject, deactivate). The other tabs start on the "gs:admin" event: statistics
// (js/admin-stats.js), orders, customers and entitlements (js/admin-records.js), customer preview with impersonation
// and test purchases (js/admin-customer.js), sales and promo codes (js/admin-promotions.js), creators
// (js/admin-creators.js), payouts (js/admin-payouts.js), AutoStacc news (js/admin-news.js), the Pack Builder (js/admin-packs.js),
// moving release artwork into storage (js/admin-artwork.js), test-purchase checks and the audit log (js/admin-audit.js).
// Needs data/workspaces.js, data/product-types.js, data/content-types.js, js/util.js and js/workspace.js.
(function () {
  "use strict";

  const { $, escapeHTML, cents, api } = window.GS;
  const root = $("#admin-app");
  if (!root) return;
  const TYPES = window.PRODUCT_TYPES || {};
  const KINDS = window.CONTENT_TYPES || {};
  // Pac titles come with the products (GET /api/admin/products), from the database.
  let PACS = {};
  const pacTitle = (id) => PACS[id] || id;
  // Sub-pages, their sidebar groups and sections come from data/workspaces.js; optional features switched off
  // (data/features.js) leave none behind. The address picks the sub-page (/admin/<id>; plain /admin is the first, Stats).
  const OPTIONAL = { packs: "packs.builder", community: "community.forum" };
  const keep = (it) => !OPTIONAL[it.key] || (window.FEATURES || {})[OPTIONAL[it.key]] !== false;
  const PAGES = (((window.WORKSPACES || {}).control || {}).pages || [])
    .map((pg) => ({ ...pg, groups: pg.groups.map((g) => ({ ...g, items: g.items.filter(keep) })).filter((g) => g.items.length) }))
    .filter((pg) => pg.groups.length);
  const keysOf = (pg) => pg.groups.flatMap((g) => g.items.map((it) => it.key));
  const PAGE = PAGES.find((pg) => pg.id === (location.pathname.match(/^\/admin\/([a-z]+)\/?$/) || [])[1]) || PAGES[0];
  const GROUPS = PAGE.groups;
  const KEYS = keysOf(PAGE);
  // Every section's panel is drawn on every sub-page (hidden), so each tab's script finds its panel wherever it runs.
  const ALL = PAGES.flatMap(keysOf);
  const LABEL = Object.fromEntries(PAGES.flatMap((pg) => pg.groups.flatMap((g) => g.items.map((it) => [it.key, it.label]))));
  const pageOf = (key) => PAGES.find((pg) => keysOf(pg).includes(key));
  const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
  let ws = null;
  // Placeholders (GS.skeleton and GS.skeleton.pending, js/skeleton.js) while access is checked, then in every tab until its script draws.
  const pending = (el, shape, n) => window.GS.skeleton && window.GS.skeleton.pending(el, shape, n);
  pending(root, "panel", 2);

  // The sub-page tabs: Stats carries a count of the payment alerts that need a look, so they're seen from every page.
  const pageTabs = (urgent) => `<nav class="admin-pages" aria-label="Control Center pages"><ul>${PAGES.map((pg) => `<li>
    <a href="/admin/${pg.id}"${pg === PAGE ? ' aria-current="page"' : ""} title="${escapeHTML(pg.hint || "")}">${escapeHTML(pg.label)}${pg.id === "stats" && urgent
      ? ` <span class="admin-badge">${urgent}<span class="sr-only"> payment alert${urgent === 1 ? "" : "s"} to check</span></span>` : ""}</a></li>`).join("")}</ul></nav>`;

  // The workspace shell (js/workspace.js): LIVE or TEST in the header, the environment under the title, the sub-page
  // tabs, the figures and payment alerts on Stats, and one panel per section (#admin-<key>, which each tab's own
  // script fills).
  function shell(s) {
    const paid = (s.orders.find((o) => o.status === "paid") || { n: 0, cents: 0 });
    const urgent = s.alerts.filter((a) => a.severity !== "info").length;
    const stats = PAGE.id === "stats";
    ws = window.GS.workspace.mount(root, {
      label: "Control Center", title: "AutoStacc store",
      subtitle: `${s.environment} · ${s.livePayments ? "Real payments. Test purchases are off here." : "Test payments only: nothing here is real revenue."}`,
      status: { text: s.livePayments ? "LIVE" : "TEST", tone: s.livePayments ? "danger" : "good" },
      groups: GROUPS, current: KEYS[0],
      onSelect: (key) => show(key)
    });
    ws.body.innerHTML = `${pageTabs(urgent)}
      ${stats ? `<ul class="admin-kpis" aria-label="Store at a glance">${[["Environment", s.environment], ["Payments", s.paymentProvider], ["Products", s.products], ["Customers", s.customers],
        ["Paid orders", `${paid.n} · ${cents(paid.cents || 0)}`], ["Active entitlements", s.activeEntitlements]]
        .map(([k, v]) => `<li><span>${k}</span><strong>${escapeHTML(String(v))}</strong></li>`).join("")}</ul>
      ${alerts(s.alerts.filter((a) => a.severity !== "info"), "msg error", "alert", "Payment events that need a look (check them in Stripe too):")}
      ${alerts(s.alerts.filter((a) => a.severity === "info"), "msg", "status", "Payment events on hold:")}` : ""}
      ${ALL.map((k) => `<section class="admin-section" data-admin-section="${k}" aria-labelledby="admin-h-${k}"${k === KEYS[0] ? "" : " hidden"}>
        <h2 class="admin-section-title" id="admin-h-${k}" tabindex="-1" data-ws-heading>${escapeHTML(LABEL[k])}</h2>
        <div class="admin-panel" id="admin-${k}"></div></section>`).join("")}`;
    ALL.forEach((k) => pending($(`#admin-${k}`), "row", 4));
  }

  // The summary's payment alerts (ranked by server/admin/alerts.js): severity spelled out, the full time, the order id
  // opening that order's details in Orders on Daily (#order=<id>, which js/admin-records.js opens) and the next step.
  const LEVEL = { critical: "Critical", warning: "Check", info: "Waiting" };
  const when = (iso) => String(iso || "").replace("T", " ").replace(/\.\d+Z$|Z$/, " UTC");
  const alerts = (list, cls, role, title) => (list.length ? `<div class="${cls} admin-alerts" role="${role}">${title}<ul>${list.map((a) => `<li data-severity="${escapeHTML(a.severity)}">
    <strong class="admin-alert-level">${LEVEL[a.severity] || escapeHTML(a.severity)}</strong> <time datetime="${escapeHTML(a.receivedAt)}">${escapeHTML(when(a.receivedAt))}</time>
    ${escapeHTML(a.type)} → ${escapeHTML(a.outcome)}${a.detail ? `: ${escapeHTML(a.detail)}` : ""}${a.orderId ? ` (order <a href="#order=${encodeURIComponent(a.orderId)}">${escapeHTML(a.orderId)}</a>)` : ""}
    <br><span class="small-print">${escapeHTML(a.next)}</span></li>`).join("")}</ul></div>` : "");

  // The open section lives in the address (/admin#orders), so a reload or a shared link lands on it.
  function show(key) {
    root.querySelectorAll("[data-admin-section]").forEach((el) => { el.hidden = el.dataset.adminSection !== key; });
    if (location.hash.slice(1) !== key) history.replaceState(null, "", key === KEYS[0] ? location.pathname : `#${key}`);
  }
  // A section on another sub-page (a link like #products from Daily, or #order=<id> from a Stats alert) opens that page
  // in place of this one, so Back doesn't bounce through it.
  const selectTab = (hash, focus) => {
    const key = hash.startsWith("order=") ? "orders" : hash;
    const home = pageOf(key);
    if (home && home !== PAGE) return location.replace(`/admin/${home.id}#${hash}`);
    ws.select(KEYS.includes(key) ? key : KEYS[0], { focus });
  };

  // A product action that didn't go through says so beside the product instead of failing silently.
  const act = async (el, path, body, method = "PATCH") => {
    const res = await api(path, { method, body });
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
    PACS = res.data.pacs || {};
    panel.innerHTML = `
      <p class="small-print">Creators make and price their products in the Studio. Here you can pause sales, hide a product from the store or show it again, remove it, and manage its paid files (hold back, publish, reject or deactivate).</p>
      <ul class="admin-list">${res.data.products.map((p) => `<li class="admin-product" data-product="${escapeHTML(p.id)}">
        <div class="admin-row"><strong>${escapeHTML(p.title)}</strong><span class="tag">${escapeHTML((TYPES[p.type] || {}).label || p.type)}</span>
          <span class="price">${p.free ? "Free" : cents(p.priceCents, p.currency)}</span>
          <span class="admin-flags">${p.deleted ? "removed" : p.published ? "published" : "draft"}${p.salesPaused ? " · sales paused" : ""}</span>
          ${p.deleted ? `<button class="btn ghost" type="button" data-product-set='{"deleted":false}'>Restore</button>` : `<button class="btn ghost" type="button" data-pause="${p.salesPaused ? "0" : "1"}">${p.salesPaused ? "Resume sales" : "Pause sales"}</button>
          <button class="btn ghost" type="button" data-product-set='{"published":${p.published ? "false" : "true"}}'>${p.published ? "Hide from store" : "Show in store"}</button>
          ${p.published ? `<button class="btn ghost" type="button" data-announce title="Email the project's followers who want new-release emails">Email followers</button>` : ""}
          <button class="btn ghost danger" type="button" data-product-remove>Remove</button>`}<span class="small-print" role="status" data-announce-msg></span></div>
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
    if (!form.matches("[data-upload]")) return;
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    if (btn.disabled) return;
    const file = $("input[type=file]", form).files[0];
    if (!file) return;
    btn.disabled = true;
    const id = form.closest("[data-product]").dataset.product;
    const label = $("input[type=text]", form).value;
    const pac = $("[data-pac]", form) ? $("[data-pac]", form).value : "";
    const kind = $("[data-kind]", form).value;
    const replaces = $("[data-replaces]", form) ? $("[data-replaces]", form).value : "";
    const hold = $("[data-hold]", form).checked;
    const query = new URLSearchParams({ filename: file.name, label, ...(pac && { pac }), ...(kind && { kind }), ...(replaces && { replaces }), ...(hold && { status: "pending" }) });
    if (await upload(`/api/admin/products/${encodeURIComponent(id)}/files?${query}`, file, $(".msg", form))) products();
    btn.disabled = false;
  });

  root.addEventListener("click", async (e) => {
    // A product id elsewhere (order details) opens that product's row in Products.
    const showP = e.target.closest("[data-show-product]");
    if (showP) {
      e.preventDefault();
      selectTab("products");
      const row = [...root.querySelectorAll("[data-product]")].find((li) => li.dataset.product === showP.dataset.showProduct);
      if (row) { row.tabIndex = -1; row.scrollIntoView({ block: "start" }); row.focus({ preventScroll: true }); }
      return;
    }
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
      // "Sent" means the email provider accepted it; refused sends stay pending and the loop stops instead of retrying forever.
      let total = 0;
      for (;;) {
        const res = await api(`/api/admin/products/${encodeURIComponent(li.dataset.product)}/announce`, { method: "POST", body: {} });
        if (!res.ok) { msg.textContent = `Stopped after ${total}: ${res.error.message}`; break; }
        total += res.data.sent;
        const people = (n) => `${n} follower${n === 1 ? "" : "s"}`;
        if (!res.data.left) { msg.textContent = total ? `Sent to ${people(total)}.` : "Nobody left to email: every follower who wants new-release emails already has this one."; break; }
        if (!res.data.sent) { msg.textContent = `Sent to ${people(total)}; ${people(res.data.left)} couldn't be emailed (the email provider refused). See Emails in the dashboard, then press again to retry them.`; break; }
        msg.textContent = `Sent ${total}, ${res.data.left} left…`;
      }
      announce.disabled = false;
      return;
    }
    // A pending file (uploaded with "hold back") reaches owners only once published.
    const pub = e.target.closest("[data-publish-file]");
    if (pub) {
      pub.disabled = true;
      return act(pub, `/api/admin/files/${encodeURIComponent(pub.dataset.publishFile)}`, { status: "published" });
    }
    // Rejecting takes a file away from owners for good (a creator's product with no file left goes back to draft).
    const rej = e.target.closest("[data-reject-file]");
    if (rej) {
      const note = prompt("Reject this file? Owners lose it and it can't be published again. Reason (optional; a creator sees it in the Studio):");
      if (note === null) return;
      rej.disabled = true;
      return act(rej, `/api/admin/files/${encodeURIComponent(rej.dataset.rejectFile)}`, { status: "rejected", ...(note.trim() && { note: note.trim() }) });
    }
    const rm = e.target.closest("[data-remove-file]");
    if (rm && !rm.disabled && confirm("Deactivate this file? Owners lose the download link; the file stays in storage.")) {
      rm.disabled = true;
      return act(rm, `/api/admin/files/${encodeURIComponent(rm.dataset.removeFile)}`, undefined, "DELETE");
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

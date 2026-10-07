// Library page ("the vault"): everything the visitor owns, from any source, with download buttons. A download asks
// the store for a fresh 5-minute private link, then follows it. Also redeems the guest key in a receipt link
// (/library#key=...). Product types come from data/product-types.js, so new kinds show up without changes here.
// Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, api, track } = window.GS;
  const root = $("#library-app");
  if (!root) return;
  const TYPES = window.PRODUCT_TYPES || {};
  const sound = (name, el) => document.dispatchEvent(new CustomEvent("gs:sound", { detail: { name, el } }));
  const params = new URLSearchParams(location.search);

  const SOURCES = { purchase: "bought", free: "free", promo: "promo", manual: "gift", bundle: "bundle", subscription: "subscription", replacement: "replacement" };
  const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);

  function banner() {
    const d = params.get("download");
    if (d === "expired") return `<p class="msg error" role="alert">That download link expired (they last a few minutes). Press download again for a fresh one.</p>`;
    if (d === "denied") return `<p class="msg error" role="alert">That download link isn't yours or no longer works. Log in with the account that owns it.</p>`;
    if (params.get("welcome")) return `<p class="msg">Email confirmed. Welcome in.</p>`;
    return "";
  }

  function item(it) {
    const type = (TYPES[it.type] || {}).label || it.type;
    const files = it.files.length
      ? `<ul class="vault-files">${it.files.map((f) => `<li>
          <span class="vault-file">${escapeHTML(f.label || f.filename)}<span class="small-print"> ${escapeHTML(f.filename)} · ${size(f.sizeBytes)}</span></span>
          <button class="btn ghost" type="button" data-download="${escapeHTML(f.id)}" data-product="${escapeHTML(it.productId)}">Download</button>
        </li>`).join("")}</ul>`
      : `<p class="small-print">Files are being stitched together. They'll appear here; nothing else to do.</p>`;
    return `<li class="vault-item">
      <div class="vault-head">
        <h2><a href="/shop/${escapeHTML(it.productId)}">${escapeHTML(it.title)}</a></h2>
        <span class="owned-badge">OWNED</span>
      </div>
      <p class="vault-meta"><span class="tag">${escapeHTML(type)}</span> ${it.sources.map((s) => `<span class="vault-source">${escapeHTML(SOURCES[s] || s)}</span>`).join(" ")}</p>
      ${files}
    </li>`;
  }

  async function load() {
    const res = await api("/api/library");
    if (res.status === 401) {
      root.innerHTML = `${banner()}<div class="panel appear"><h2>Locked</h2>
        <p>Log in to open your library. Bought as a guest? Use the link in your receipt email, or create an account with the email you paid with: your purchases join it automatically.</p>
        <div class="actions"><a class="btn" href="/login?next=/library">Log in</a><a class="btn ghost" href="/login?next=/library#signup">Create account</a></div></div>`;
      return;
    }
    if (!res.ok) {
      root.innerHTML = `${banner()}<p class="msg error">${escapeHTML(res.status === 503 ? "The store is offline for maintenance. Your files are safe; try again soon." : res.error.message)}</p>
        <div class="actions"><button class="btn" type="button" data-retry>Try again</button></div>`;
      return;
    }
    const { items, signedIn } = res.data;
    const guest = !signedIn ? `<p class="msg">You're viewing a guest order. <a href="/login?next=/library#signup">Create an account</a> with the same email to keep these for good.</p>` : "";
    root.innerHTML = banner() + guest + (items.length
      ? `<ul class="vault">${items.map(item).join("")}</ul>`
      : `<div class="panel appear"><h2>Empty</h2><p>Nothing owned yet. Every piece you buy or claim lands here.</p><div class="actions"><a class="btn" href="/shop">Browse the shop</a></div></div>`);
  }

  async function download(btn) {
    btn.disabled = true;
    btn.classList.add("busy");
    const res = await api("/api/downloads", { method: "POST", body: { fileId: btn.dataset.download } });
    btn.disabled = false;
    btn.classList.remove("busy");
    if (res.ok) {
      track("download_request", btn.dataset.product);
      sound("blip", btn);
      location.href = res.data.url;
      return;
    }
    sound("error");
    const text = res.status === 0 ? res.error.message : res.status === 401 ? "Your session ended. Log in again." : res.error.message;
    const prior = btn.closest("li").querySelector(".msg");
    if (prior) prior.remove();
    const note = document.createElement("p");
    note.className = "msg error";
    note.setAttribute("role", "alert");
    note.textContent = text;
    btn.closest("li").append(note);
  }

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-download]");
    if (btn && !btn.disabled) download(btn);
    if (e.target.closest("[data-retry]")) load();
  });

  // A receipt link (#key=ord_x.secret): store it as a cookie, take it out of the address bar, then open the vault.
  (async () => {
    const key = new URLSearchParams(location.hash.slice(1)).get("key");
    if (key) {
      history.replaceState(null, "", location.pathname + location.search);
      const res = await api("/api/guest/key", { method: "POST", body: { key } });
      if (!res.ok && res.status !== 0) root.insertAdjacentHTML("beforebegin", `<p class="msg error">${escapeHTML(res.error.message)}</p>`);
    }
    load();
  })();
})();

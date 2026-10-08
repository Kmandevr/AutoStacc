// Your Stacc (/library): everything the visitor can use, organized by project → Stacclet → Pac → content type or by
// content type across everything, with filters, per-file and selected downloads (docs/library.md). Ownership and
// files come from the store API; structure from data/ via GS.stacc (js/stacc-model.js) and markup from
// GS.libraryView (js/library-view.js). Each download asks for a fresh 5-minute private link. Also redeems the guest
// key in a receipt link (/library#key=...). Needs js/util.js, js/stacc-model.js, js/library-view.js and data/projects.js,
// stacclets.js, pacs.js, content-types.js.
(function () {
  "use strict";

  const { $, escapeHTML, api, track } = window.GS;
  const root = $("#library-app");
  if (!root) return;
  const { stacc, libraryView: V } = window.GS;
  const catalog = { projects: window.PROJECTS || [], stacclets: window.STACCLETS || [], pacs: window.PACS || [], contentTypes: window.CONTENT_TYPES || {} };
  const nameIn = (list, key) => (id) => ((list.find((x) => x.id === id) || {})[key]) || id || "Other";
  const names = { project: nameIn(catalog.projects, "name"), stacclet: nameIn(catalog.stacclets, "title"), pac: nameIn(catalog.pacs, "title") };
  const sound = (name, el) => document.dispatchEvent(new CustomEvent("gs:sound", { detail: { name, el } }));
  const params = new URLSearchParams(location.search);
  const state = { view: "projects", filter: { project: "", kind: "", format: "" }, selected: new Set(), assets: [], items: [], follows: null, discover: [] };

  function banner() {
    const d = params.get("download");
    if (d === "expired") return `<p class="msg error" role="alert">That download link expired (they last a few minutes). Press download again for a fresh one.</p>`;
    if (d === "denied") return `<p class="msg error" role="alert">That download link isn't yours or no longer works. Log in with the account that owns it.</p>`;
    if (params.get("welcome")) return `<p class="msg">Email confirmed. Welcome in.</p>`;
    return "";
  }

  function render() {
    const ctx = { catalog, names, selected: state.selected };
    const view = state.view === "kinds" ? V.kindView(stacc.byKind(state.assets, catalog, state.filter), ctx) : V.treeView(stacc.tree(state.assets, catalog, state.filter), ctx);
    const files = state.assets.length ? `${V.toolbar(stacc.facets(state.assets), state, ctx)}${V.selection(state.selected.size)}
      <div class="stacc-view">${view || `<p class="msg">Nothing matches those filters.</p>`}</div>` : "";
    const waiting = state.items.filter((it) => !it.files.length);
    root.querySelector("[data-stacc]").innerHTML = files + V.waiting(waiting) + V.following(state.follows, state.discover, ctx);
  }

  async function load() {
    const res = await api("/api/library");
    if (res.status === 401) {
      root.innerHTML = `${banner()}<div class="panel appear"><h2>Locked</h2>
        <p>Log in to open Your Stacc. Bought as a guest? Use the link in your receipt email, or create an account with the email you paid with: your purchases join it automatically.</p>
        <div class="actions"><a class="btn" href="/login?next=/library">Log in</a><a class="btn ghost" href="/login?next=/library#signup">Create account</a></div></div>`;
      return;
    }
    if (!res.ok) {
      root.innerHTML = `${banner()}<p class="msg error">${escapeHTML(res.status === 503 ? "The store is offline for maintenance. Your files are safe; try again soon." : res.error.message)}</p>
        <div class="actions"><button class="btn" type="button" data-retry>Try again</button></div>`;
      return;
    }
    const { items, signedIn } = res.data;
    state.items = items;
    state.assets = stacc.assetsFrom(items, catalog);
    const guest = !signedIn ? `<p class="msg">You're viewing a guest order. <a href="/login?next=/library#signup">Create an account</a> with the same email to keep these for good.</p>` : "";
    root.innerHTML = banner() + guest + (items.length ? "" : `<div class="panel appear"><h2>Empty</h2><p>Nothing owned yet. Every piece you buy or claim lands here, sorted for you.</p><div class="actions"><a class="btn" href="/shop">Browse the store</a></div></div>`) + `<div data-stacc></div>`;
    if (signedIn) await discover(new Set(items.map((it) => it.productId)));
    render();
  }

  // Published products of followed projects not owned yet (the store decides what's published and what's free).
  async function discover(owned) {
    const [projects, products] = await Promise.all([api("/api/projects"), api("/api/products")]);
    if (!projects.ok || !products.ok) return;
    state.follows = projects.data.follows;
    const followed = new Set((state.follows || []).map((f) => f.projectId));
    state.discover = products.data.products.filter((p) => followed.has(p.projectId) && !owned.has(p.id) && p.available);
  }

  // Asks for a signed link and starts the download. Returns null on success, or the error message.
  async function fetchFile(fileId, productId) {
    const res = await api("/api/downloads", { method: "POST", body: { fileId } });
    if (!res.ok) return res.status === 401 ? "Your session ended. Log in again." : res.error.message;
    track("download_request", productId);
    const a = document.createElement("a");
    a.href = res.data.url;
    a.download = res.data.filename || "";
    document.body.append(a);
    a.click();
    a.remove();
    return null;
  }

  function note(el, text) {
    const prior = el.querySelector(":scope > .msg");
    if (prior) prior.remove();
    if (!text) return;
    const msg = document.createElement("p");
    msg.className = "msg error";
    msg.setAttribute("role", "alert");
    msg.textContent = text;
    el.append(msg);
  }

  async function download(btn) {
    btn.disabled = true;
    btn.classList.add("busy");
    const error = await fetchFile(btn.dataset.download, btn.dataset.product);
    btn.disabled = false;
    btn.classList.remove("busy");
    sound(error ? "error" : "blip", btn);
    note(btn.closest("li"), error);
  }

  // One file after another, a moment apart, so the browser treats each as its own download.
  async function downloadSelected(btn) {
    btn.disabled = true;
    const list = state.assets.filter((a) => state.selected.has(a.id));
    const status = btn.closest(".stacc-selection");
    const errors = [];
    for (const [i, a] of list.entries()) {
      btn.textContent = `Downloading ${i + 1} of ${list.length}…`;
      const error = await fetchFile(a.id, a.productId);
      if (error) errors.push(`${a.name}: ${error}`);
      await new Promise((r) => setTimeout(r, 700));
    }
    btn.disabled = false;
    btn.textContent = "Download selected";
    sound(errors.length ? "error" : "blip", btn);
    note(status, errors.join(" "));
  }

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-download]");
    if (btn && !btn.disabled) download(btn);
    const sel = e.target.closest("[data-download-selected]");
    if (sel && !sel.disabled) downloadSelected(sel);
    const view = e.target.closest("[data-view]");
    if (view) { state.view = view.dataset.view; render(); }
    if (e.target.closest("[data-clear-selection]")) { state.selected.clear(); render(); }
    if (e.target.closest("[data-retry]")) load();
  });

  // Ticking boxes updates the boxes and the selection bar in place, so keyboard focus stays where it was.
  function syncSelection() {
    root.querySelectorAll("[data-select]").forEach((box) => (box.checked = state.selected.has(box.dataset.select)));
    root.querySelectorAll("[data-select-group]").forEach((box) => (box.checked = box.dataset.selectGroup.split(" ").every((id) => state.selected.has(id))));
    const bar = root.querySelector(".stacc-selection");
    if (bar) bar.outerHTML = V.selection(state.selected.size);
  }

  root.addEventListener("change", (e) => {
    const t = e.target;
    const set = (id) => state.selected[t.checked ? "add" : "delete"](id);
    if (t.matches("[data-select]")) set(t.dataset.select);
    else if (t.matches("[data-select-group]")) t.dataset.selectGroup.split(" ").forEach(set);
    if (t.matches("[data-select], [data-select-group]")) return syncSelection();
    if (!t.matches("[data-filter]")) return;
    state.filter[t.dataset.filter] = t.value;
    render();
    root.querySelector(`[data-filter="${t.dataset.filter}"]`).focus();
  });

  // A receipt link (#key=ord_x.secret): store it as a cookie, take it out of the address bar, then open the Stacc.
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

// Your Stacc (/library): everything the visitor can use, organized by project → Stacclet → Pac → content type or by
// content type across everything, with filters, per-file and selected downloads (docs/library.md). Ownership and
// files come from the store API; structure from data/ via GS.stacc (js/stacc-model.js), computed on a background thread
// through GS.staccClient (js/stacc-client.js, js/stacc-worker.js), and markup from GS.libraryView (js/library-view.js).
// Each download asks for a fresh 5-minute private link. Also redeems the guest key in a receipt link (/library#key=...).
// A drop-in for any [data-stacc] element: data-project starts it filtered to one project (and wears that project's
// look), data-stacc-view="kinds" starts it by content type instead of by project.
// Needs js/util.js, js/stacc-model.js, js/stacc-client.js, js/library-view.js and data/projects.js, stacclets.js,
// pacs.js, content-types.js.
(function () {
  "use strict";

  const { escapeHTML, api, track, wear } = window.GS;
  const roots = [...document.querySelectorAll("[data-stacc]")];
  if (!roots.length) return;
  const { libraryView: V } = window.GS;
  const sound = (name, el) => document.dispatchEvent(new CustomEvent("gs:sound", { detail: { name, el } }));
  const params = new URLSearchParams(location.search);

  // The page's own Stacc (no data-project) keeps its view, search and filters in the address (/library?q=&kind=...).
  const FILTERS = ["q", "project", "kind", "format"];
  let mounted = 0;
  function mount(root) {
    const uid = ++mounted;
    const addressed = !root.dataset.project && uid === 1;
    const model = window.GS.staccClient();
    const catalog = { projects: [...(window.PROJECTS || [])], stacclets: window.STACCLETS || [], pacs: window.PACS || [], contentTypes: window.CONTENT_TYPES || {} };
    const nameIn = (list, key) => (id) => ((list.find((x) => x.id === id) || {})[key]) || id || "Other";
    const names = { project: nameIn(catalog.projects, "name"), stacclet: nameIn(catalog.stacclets, "title"), pac: nameIn(catalog.pacs, "title") };
    const state = { view: root.dataset.staccView === "kinds" ? "kinds" : "projects", filter: { q: "", project: root.dataset.project || "", kind: "", format: "" }, selected: new Set(), assets: [], items: [], follows: null, discover: [] };
    let asked = 0, shown = null; // the newest model request, and the last answer drawn
    if (addressed) {
      for (const k of FILTERS) state.filter[k] = (params.get(k) || "").slice(0, 80);
      if (params.get("view") === "kinds") state.view = "kinds";
    }
    wear(root, state.filter.project);
    function remember() {
      if (!addressed) return;
      const p = new URLSearchParams(location.search);
      for (const k of FILTERS) state.filter[k] ? p.set(k, state.filter[k]) : p.delete(k);
      state.view === "kinds" ? p.set("view", "kinds") : p.delete("view");
      const qs = p.toString();
      history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
    }

    function banner() {
      const d = params.get("download");
      if (d === "expired") return `<p class="msg error" role="alert">That download link expired (they last a few minutes). Press download again for a fresh one.</p>`;
      if (d === "denied") return `<p class="msg error" role="alert">That download link isn't yours or no longer works. Log in with the account that owns it.</p>`;
      if (params.get("welcome")) return `<p class="msg">Email confirmed. Welcome in.</p>`;
      return "";
    }

    // Draws the last model answer; redraws that need no model work (clearing the selection) call this directly.
    function paint() {
      const box = root.querySelector("[data-stacc-files]");
      if (!box || !shown) return;
      const ctx = { catalog, names, selected: state.selected, uid };
      const view = shown.view === "kinds" ? V.kindView(shown.groups, ctx) : V.treeView(shown.groups, ctx);
      const files = state.assets.length ? `${V.toolbar(shown.facets, state, ctx, shown)}${V.selection(state.selected.size)}
        <div class="stacc-view">${view || `<p class="msg">Nothing matches those filters.</p>`}</div>` : "";
      const waiting = state.items.filter((it) => !it.files.length);
      box.innerHTML = files + V.waiting(waiting) + V.following(state.follows, state.discover, ctx);
    }

    // Asks the model for the current view and filters; the latest request wins, so a slow answer never draws over a newer
    // one. Resolves true when this answer was drawn.
    async function render() {
      const n = ++asked;
      remember();
      const answer = await model.ask({ type: "view", view: state.view, filter: { ...state.filter } });
      if (n !== asked) return false;
      shown = answer;
      paint();
      return true;
    }

    async function load() {
      const n = ++asked; // a reload drops any view still being worked out
      const res = await api("/api/library");
      if (res.status === 401) {
        root.innerHTML = `${banner()}<div class="panel appear"><h2>Locked</h2>
          <p>Log in to open Your Stacc. Bought as a guest? Use the link in your receipt email, or create an account with the email you paid with: everything you Stacc'd joins it automatically.</p>
          <div class="actions"><a class="btn" href="/login?next=/library">Log in</a><a class="btn ghost" href="/login?next=/library#signup">Create account</a></div></div>`;
        return;
      }
      if (!res.ok) {
        root.innerHTML = `${banner()}<p class="msg error">${escapeHTML(res.status === 503 ? "The store is offline for maintenance. Your files are safe; try again soon." : res.error.message)}</p>
          <div class="actions"><button class="btn" type="button" data-retry>Try again</button></div>`;
        return;
      }
      const { items, signedIn } = res.data;
      // Projects made in the Studio aren't in data/projects.js; the store names them.
      items.forEach((i) => {
        if (i.projectId && i.projectName && !catalog.projects.some((p) => p.id === i.projectId)) catalog.projects.push({ id: i.projectId, name: i.projectName });
      });
      const built = await model.ask({ type: "build", items, catalog });
      if (n !== asked) return;
      state.items = items;
      state.assets = built.assets;
      const guest = !signedIn ? `<p class="msg">You're viewing a guest order. <a href="/login?next=/library#signup">Create an account</a> with the same email to keep these for good.</p>` : "";
      root.innerHTML = banner() + guest + (items.length ? "" : `<div class="panel appear"><h2>Empty</h2><p>Nothing Stacc'd yet. Every piece you buy or claim lands here, sorted for you.</p><div class="actions"><a class="btn" href="/shop">Browse the store</a></div></div>`) + `<div data-stacc-files></div>`;
      if (signedIn) await discover(new Set(items.map((it) => it.productId)));
      await render();
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
      if (e.target.closest("[data-clear-filters]")) {
        for (const k of FILTERS) if (k !== "project" || !root.dataset.project) state.filter[k] = "";
        render().then((drawn) => drawn && root.querySelector('[data-filter="q"]').focus());
      }
      if (e.target.closest("[data-clear-selection]")) { state.selected.clear(); paint(); }
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
      if (!t.matches("[data-filter]") || t.dataset.filter === "q") return;
      state.filter[t.dataset.filter] = t.value;
      render().then((drawn) => drawn && root.querySelector(`[data-filter="${t.dataset.filter}"]`).focus());
    });

    // Search narrows as you type (a short pause first); focus and the caret stay in the box across the redraw.
    let typing = 0;
    root.addEventListener("input", (e) => {
      const t = e.target;
      if (!t.matches('[data-filter="q"]')) return;
      clearTimeout(typing);
      typing = setTimeout(() => {
        state.filter.q = t.value.trim().slice(0, 80);
        const at = t.selectionStart;
        render().then((drawn) => {
          const box = drawn && root.querySelector('[data-filter="q"]');
          if (box) { box.focus(); box.setSelectionRange(at, at); }
        });
      }, 220);
    });
    root.addEventListener("submit", (e) => { if (e.target.matches("[data-stacc-search]")) e.preventDefault(); });

    return load;
  }

  // A receipt link (#key=ord_x.secret): store it as a cookie, take it out of the address bar, then open each Stacc.
  const loads = roots.map(mount);
  (async () => {
    const key = new URLSearchParams(location.hash.slice(1)).get("key");
    if (key) {
      history.replaceState(null, "", location.pathname + location.search);
      const res = await api("/api/guest/key", { method: "POST", body: { key } });
      if (!res.ok && res.status !== 0) roots[0].insertAdjacentHTML("beforebegin", `<p class="msg error">${escapeHTML(res.error.message)}</p>`);
    }
    loads.forEach((load) => load());
  })();
})();

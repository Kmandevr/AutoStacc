// Your Stacc (/library): everything the visitor can use, organized by project → Stacclet → Pac → content type or by
// content type across everything, with filters, per-file and selected downloads (docs/library.md). Ownership and
// files, and the names of the owned Pacs and their Stacclets, come from the store API (/api/library); projects and
// content types from data/; joined by GS.stacc (js/stacc-model.js), computed on a background thread
// through GS.staccClient (js/stacc-client.js, js/stacc-worker.js), and markup from GS.libraryView (js/library-view.js).
// Each download asks for a fresh 5-minute private link. Also redeems the guest key in a receipt link (/library#key=...).
// A drop-in for any [data-stacc] element: data-project starts it filtered to one project (and wears that project's
// look), data-stacc-view="kinds" starts it by content type instead of by project. Placeholder rows while it loads.
// Needs js/util.js (js/skeleton.js optional), js/stacc-model.js, js/stacc-client.js, js/library-view.js and data/projects.js, content-types.js.
(function () {
  "use strict";

  const { escapeHTML, api, track, wear } = window.GS;
  const roots = [...document.querySelectorAll("[data-stacc]")];
  if (!roots.length) return;
  const { libraryView: V, skeleton: sk } = window.GS;
  const sound = (name, el) => document.dispatchEvent(new CustomEvent("gs:sound", { detail: { name, el } }));
  const params = new URLSearchParams(location.search);

  // The page's own Stacc (no data-project) keeps its view, search and filters in the address (/library?q=&kind=...).
  const FILTERS = ["q", "project", "kind", "format", "collection", "tag"];
  // A signed-in person's collections, tags and saved searches (js/library-personal.js), when it's loaded and switched on.
  const P = window.GS.libraryPersonal;
  let mounted = 0;
  function mount(root) {
    const uid = ++mounted;
    const addressed = !root.dataset.project && uid === 1;
    const model = window.GS.staccClient();
    const catalog = { projects: [...(window.PROJECTS || [])], stacclets: [], pacs: [], contentTypes: window.CONTENT_TYPES || {}, kindAliases: window.CONTENT_TYPE_ALIASES || {} };
    // Looked up when asked: the store's answer fills in the Stacclets and Pacs after mounting.
    const nameIn = (list, key) => (id) => ((catalog[list].find((x) => x.id === id) || {})[key]) || id || "Other";
    const names = { project: nameIn("projects", "name"), stacclet: nameIn("stacclets", "title"), pac: nameIn("pacs", "title") };
    const state = { view: root.dataset.staccView === "kinds" ? "kinds" : "projects", filter: { q: "", project: root.dataset.project || "", kind: "", format: "", collection: "", tag: "" }, selected: new Set(), assets: [], items: [], follows: null, discover: [], personal: null };
    root.staccSelection = () => [...state.selected];
    let asked = 0, shown = null; // the newest model request, and the last answer drawn
    if (addressed) {
      for (const k of FILTERS) state.filter[k] = (params.get(k) || "").slice(0, 80);
      state.filter.kind = (window.CONTENT_TYPE_ALIASES || {})[state.filter.kind] || state.filter.kind; // old links (?kind=samples)
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

    function context() {
      const p = state.personal;
      return { catalog, names, selected: state.selected, uid,
        ...(p && P ? { filters: (facets) => P.filters(p, facets, state.filter), tools: (n) => P.tools(p, n, state.filter), chips: P.chips } : {}) };
    }

    // Draws the last model answer; redraws that need no model work (clearing the selection) call this directly.
    function paint() {
      const box = root.querySelector("[data-stacc-files]");
      if (!box || !shown) return;
      const ctx = context();
      const head = root.querySelector("[data-stacc-head]");
      if (head && state.assets.length && !head.firstChild) head.innerHTML = V.search(state, ctx);
      const count = root.querySelector("[data-stacc-found]"), said = V.found(state, shown);
      if (count && count.dataset.said !== said) { count.innerHTML = said; count.dataset.said = said; } // announce changes only
      const view = shown.view === "kinds" ? V.kindView(shown.groups, ctx) : V.treeView(shown.groups, ctx);
      const files = state.assets.length ? `${addressed && P ? P.saved(state.personal, state.filter) : ""}${V.toolbar(shown.facets, state, ctx)}${V.selection(state.selected.size, ctx)}
        <div class="stacc-view">${view || `<p class="msg">Nothing matches those filters.</p>`}</div>` : "";
      const waiting = state.items.filter((it) => !it.files.length);
      if (sk) sk.done(box);
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
      if (sk) sk.show(root, "row", 4); // placeholder rows (GS.skeleton) until the store and the model answer
      const fill = (html) => { if (sk) sk.done(root); root.innerHTML = html; };
      const res = await api("/api/library");
      if (res.status === 401) {
        fill(`${banner()}<div class="panel appear"><h2>Locked</h2>
          <p>Log in to open Your Stacc. Bought as a guest? Use the link in your receipt email, or create an account with the email you paid with: everything you Stacc'd joins it automatically.</p>
          <div class="actions"><a class="btn" href="/login?next=/library">Log in</a><a class="btn ghost" href="/login?next=/library#signup">Create account</a></div></div>`);
        return;
      }
      if (!res.ok) {
        fill(`${banner()}<p class="msg error">${escapeHTML(res.status === 503 ? "The store is offline for maintenance. Your files are safe; try again soon." : res.error.message)}</p>
          <div class="actions"><button class="btn" type="button" data-retry>Try again</button></div>`);
        return;
      }
      const { items, signedIn } = res.data;
      // The owned products' Stacclets and Pacs, named by the store (#176: none are defined in code).
      catalog.stacclets = Array.isArray(res.data.stacclets) ? res.data.stacclets : [];
      catalog.pacs = Array.isArray(res.data.pacs) ? res.data.pacs : [];
      // Projects made in the Studio aren't in data/projects.js; the store names them.
      items.forEach((i) => {
        if (i.projectId && i.projectName && !catalog.projects.some((p) => p.id === i.projectId)) catalog.projects.push({ id: i.projectId, name: i.projectName });
      });
      const personal = signedIn && P ? await P.load() : null;
      const built = await model.ask({ type: "build", items, catalog, personal });
      if (n !== asked) return;
      state.personal = personal;
      state.items = items;
      state.assets = built.assets;
      const guest = !signedIn ? `<p class="msg">You're viewing a guest order. <a href="/login?next=/library#signup">Create an account</a> with the same email to keep these for good.</p>` : "";
      fill(banner() + guest + (items.length ? "" : `<div class="panel appear"><h2>Empty</h2><p>Nothing Stacc'd yet. Every piece you buy or claim lands here, sorted for you.</p><div class="actions"><a class="btn" href="/shop">Browse the store</a></div></div>`) + `<div data-stacc-head></div><div data-stacc-files></div>`);
      if (sk && items.length) sk.show(root.querySelector("[data-stacc-files]"), "row", 3);
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
        const box = root.querySelector('[data-filter="q"]');
        if (box) { box.value = ""; box.focus(); }
        render();
      }
      if (e.target.closest("[data-clear-selection]")) { state.selected.clear(); paint(); }
      if (e.target.closest("[data-retry]")) load();
    });

    // Ticking boxes updates the boxes and the selection bar in place, so keyboard focus stays where it was.
    function syncSelection() {
      root.querySelectorAll("[data-select]").forEach((box) => (box.checked = state.selected.has(box.dataset.select)));
      root.querySelectorAll("[data-select-group]").forEach((box) => (box.checked = box.dataset.selectGroup.split(" ").every((id) => state.selected.has(id))));
      const bar = root.querySelector(".stacc-selection");
      if (bar) bar.outerHTML = V.selection(state.selected.size, context());
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

    // Search narrows as you type (a short pause first); the box itself is never redrawn.
    let typing = 0;
    root.addEventListener("input", (e) => {
      const t = e.target;
      if (!t.matches('[data-filter="q"]')) return;
      clearTimeout(typing);
      typing = setTimeout(() => {
        state.filter.q = t.value.trim().slice(0, 80);
        render();
      }, 220);
    });
    root.addEventListener("submit", (e) => { if (e.target.matches("[data-stacc-search]")) e.preventDefault(); });

    // A collection, tag or saved search changed (js/library-personal.js): reload them and redraw.
    root.addEventListener("gs:stacc-personal", async (e) => {
      const personal = await P.load();
      const { clear, leave } = e.detail || {};
      if (leave) state.filter[leave] = "";
      if (clear) state.selected.clear();
      const built = await model.ask({ type: "build", items: state.items, catalog, personal });
      state.personal = personal;
      state.assets = built.assets;
      render();
    });

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

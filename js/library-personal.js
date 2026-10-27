// Your Stacc, personal organization (docs/library.md; server/collections/): a signed-in person's own collections, tags
// and saved searches. Sets GS.libraryPersonal for js/library.js: load() fetches them (null when signed out or switched
// off), filters / tools / chips / saved draw the controls that library.js puts into its toolbar, selection bar, file
// rows and head. Acts on its own: creating and filling collections, tagging the selected files (read from the Stacc's
// root, root.staccSelection()), saving and deleting searches; after each change it fires "gs:stacc-personal" on that
// root so library.js reloads. The store decides what is the person's; this only shows its answers. Needs js/util.js.
(function () {
  "use strict";

  const { api, escapeHTML: e, skeleton: sk } = window.GS;
  // The address keys of Your Stacc's view and filters (js/library.js), the only ones a saved search keeps.
  const QUERY_KEYS = ["view", "q", "project", "kind", "format", "collection", "tag"];
  const on = () => Boolean(window.FEATURES && window.FEATURES["library.collections"]);

  async function load() {
    if (!on()) return null;
    const res = await api("/api/collections");
    return res.ok ? res.data : null;
  }

  const option = (v, label, cur) => `<option value="${e(v)}"${v === cur ? " selected" : ""}>${e(label)}</option>`;

  // Two more filter menus: the person's collections and tags.
  function filters(p, facets, filter) {
    if (!p) return "";
    const cols = p.collections.length ? `<label class="stacc-filter">Collection<select data-filter="collection"><option value="">All</option>
      ${p.collections.map((c) => option(c.id, `${c.name} (${c.items.length})`, filter.collection)).join("")}</select></label>` : "";
    const tags = (facets.tags || []).length ? `<label class="stacc-filter">Tag<select data-filter="tag"><option value="">All</option>
      ${facets.tags.map(([t, n]) => option(t, `${t} (${n})`, filter.tag)).join("")}</select></label>` : "";
    return cols + tags;
  }

  // In the selection bar: add the selected files to a collection (or a new one), tag them; in a collection, take them out.
  function tools(p, count, filter) {
    if (!p || !count) return "";
    const cols = p.collections.map((c) => option(c.id, c.name, filter.collection)).join("");
    const current = filter.collection && p.collections.find((c) => c.id === filter.collection);
    return `<form class="stacc-personal-form" data-personal="collect">
        <label>Add to <select name="collection">${cols}<option value="">New collection…</option></select></label>
        <input name="name" maxlength="60" placeholder="New collection name" aria-label="New collection name">
        <button class="btn ghost" type="submit">Add</button></form>
      <form class="stacc-personal-form" data-personal="tag">
        <input name="tag" maxlength="30" placeholder="Tag, e.g. dark pads" aria-label="Tag the selected files" list="stacc-tags">
        <datalist id="stacc-tags">${Object.values(p.tags).flat().filter((t, i, a) => a.indexOf(t) === i).map((t) => `<option value="${e(t)}">`).join("")}</datalist>
        <button class="btn ghost" type="submit">Tag</button></form>
      ${current ? `<button class="link-btn" type="button" data-personal-remove>Remove from ${e(current.name)}</button>` : ""}`;
  }

  // A file's own tags, each removable.
  const chips = (a) => (a.tags || []).map((t) => `<span class="chip">${e(t)} <button class="link" type="button" data-untag="${e(t)}" data-file="${e(a.id)}" aria-label="Remove the tag ${e(t)} from ${e(a.name)}">✕</button></span>`).join(" ");

  // Above the toolbar (the page's own Stacc only, whose filters live in the address): saved searches, saving this one,
  // and the open collection's own controls.
  function saved(p, filter) {
    if (!p) return "";
    const open = filter.collection && p.collections.find((c) => c.id === filter.collection);
    const searches = p.searches.map((s) => `<li><a href="/library?${e(s.query)}">${e(s.name)}</a>
      <button class="link" type="button" data-search-delete="${e(s.id)}" aria-label="Delete the saved search ${e(s.name)}">✕</button></li>`).join("");
    const filtered = [...new URLSearchParams(location.search).keys()].some((k) => QUERY_KEYS.includes(k));
    return `<div class="stacc-personal">
      ${searches ? `<ul class="plain stacc-saved" aria-label="Saved searches">${searches}</ul>` : ""}
      ${filtered ? `<form class="stacc-personal-form" data-personal="search"><input name="name" maxlength="60" placeholder="Name this search" aria-label="Name this search" required>
        <button class="btn ghost" type="submit">Save search</button></form>` : ""}
      ${open ? `<p class="small-print">${e(open.name)}: ${open.items.length} file${open.items.length === 1 ? "" : "s"}${open.missing ? `, and ${open.missing} no longer in Your Stacc <button class="link-btn" type="button" data-personal-clear>Clear them</button>` : ""}
        · <button class="link-btn" type="button" data-personal-rename>Rename</button> · <button class="link-btn" type="button" data-personal-delete>Delete collection</button></p>` : ""}
      <p class="msg" role="status" hidden></p></div>`;
  }

  // Actions, on every Stacc on the page.
  function wire(root) {
    const changed = (clear) => root.dispatchEvent(new CustomEvent("gs:stacc-personal", { detail: { clear } }));
    const say = (text) => {
      const m = root.querySelector(".stacc-personal .msg") || root.querySelector(".stacc-selection");
      if (m && m.matches(".msg")) { m.hidden = !text; m.className = "msg error"; m.textContent = text; }
      else if (text) window.GS.toast(text, true);
    };
    const selected = () => (root.staccSelection ? root.staccSelection() : []);
    const filterOf = (k) => { const s = root.querySelector(`[data-filter="${k}"]`); return s ? s.value : ""; };
    async function call(btn, url, method, body) {
      const pending = (on) => { if (sk) sk.busy(btn, on); else if (btn) btn.disabled = on; }; // spinner when GS.skeleton is loaded
      pending(true);
      const res = await api(url, { method, body });
      pending(false);
      if (!res.ok) { say(res.error.message); return null; }
      return res.data;
    }

    root.addEventListener("submit", async (ev) => {
      const f = ev.target.closest("[data-personal]");
      if (!f) return;
      ev.preventDefault();
      const btn = f.querySelector("button[type=submit]");
      const kind = f.dataset.personal;
      if (kind === "collect") {
        let id = f.collection.value;
        if (!id) {
          const made = await call(btn, "/api/collections", "POST", { name: f.name.value });
          if (!made) return;
          id = made.collection.id;
        }
        if (await call(btn, `/api/collections/${encodeURIComponent(id)}/items`, "POST", { fileIds: selected() })) changed(true);
      } else if (kind === "tag") {
        if (await call(btn, "/api/tags", "POST", { fileIds: selected(), tag: f.tag.value })) changed(true);
      } else if (kind === "search") {
        const q = new URLSearchParams([...new URLSearchParams(location.search)].filter(([k]) => QUERY_KEYS.includes(k)));
        if (await call(btn, "/api/saved-searches", "POST", { name: f.name.value, query: q.toString() })) changed(false);
      }
    });

    root.addEventListener("click", async (ev) => {
      const t = ev.target;
      const cid = filterOf("collection");
      const untag = t.closest("[data-untag]");
      if (untag && (await call(untag, "/api/tags/remove", "POST", { fileIds: [untag.dataset.file], tag: untag.dataset.untag }))) return changed(false);
      const del = t.closest("[data-search-delete]");
      if (del && await window.GS.confirm("Delete this saved search?") && (await call(del, `/api/saved-searches/${encodeURIComponent(del.dataset.searchDelete)}`, "DELETE"))) return changed(false);
      if (!cid) return;
      const base = `/api/collections/${encodeURIComponent(cid)}`;
      const remove = t.closest("[data-personal-remove]");
      if (remove && (await call(remove, `${base}/items/remove`, "POST", { fileIds: selected() }))) return changed(true);
      const clear = t.closest("[data-personal-clear]");
      if (clear && (await call(clear, `${base}/items/remove`, "POST", { missing: true }))) return changed(false);
      const rename = t.closest("[data-personal-rename]");
      if (rename) {
        const name = prompt("New name for this collection:");
        if (name && (await call(rename, base, "PATCH", { name }))) return changed(false);
      }
      const drop = t.closest("[data-personal-delete]");
      if (drop && await window.GS.confirm("Delete this collection? Its files stay in Your Stacc.") && (await call(drop, base, "DELETE"))) {
        root.dispatchEvent(new CustomEvent("gs:stacc-personal", { detail: { clear: true, leave: "collection" } }));
      }
    });
  }

  document.querySelectorAll("[data-stacc]").forEach(wire);
  window.GS.libraryPersonal = { load, filters, tools, chips, saved };
})();

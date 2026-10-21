// Product Studio (GS.studioWorkspace, for js/studio.js; docs/studio.md): one product in the workspace shell
// (js/workspace.js) at #product=<id>&section=<key>. Loads GET /api/studio/products/:id, draws the header (name, status,
// Preview, Publish or Unpublish, a settings menu) and hands the open section to its module, GS.studioSections[key]
// (js/studio-section-*.js): draw(el, ctx) with ctx = { product, workspace, reload(), go(key), setSave(state), note(text,
// error), release(act) }. draw may return a function, called when the section is left. Loading placeholders show until
// the product and then each section draw (GS.skeleton.pending). The server decides everything; this only shows its answers. Needs data/workspaces.js, js/util.js, js/workspace.js and js/studio-kit.js.
(function () {
  "use strict";

  const { escapeHTML: e, api } = window.GS;
  const K = () => window.GS.studioKit;
  const SPEC = () => (window.WORKSPACES || {}).product || { label: "Product Studio", sections: [] };
  const BODIES = { publish: { published: true }, draft: { published: false }, pause: { salesPaused: true }, resume: { salesPaused: false }, remove: { deleted: true }, restore: { deleted: false } };
  let leaving = null;

  function leave() {
    const fn = leaving;
    leaving = null;
    if (fn) try { fn(); } catch {}
  }

  async function open(root, id, wanted) {
    leave();
    root.onclick = root.onchange = root.onsubmit = root.oninput = null;
    if (window.GS.skeleton) window.GS.skeleton.pending(root, "panel", 2); else root.innerHTML = '<p class="msg pending">Opening the product…</p>';
    const url = `/api/studio/products/${encodeURIComponent(id)}`;
    const first = await api(url);
    if (!first.ok) {
      root.innerHTML = `<p class="msg error">${e(first.status === 404 ? "That product isn't one of yours, or it doesn't exist." : first.error.message)}</p><p><a class="btn ghost" href="/studio">Back to the Studio</a></p>`;
      return;
    }
    let payload = first.data;
    const spec = SPEC();
    const sections = spec.sections;
    const keys = sections.map((s) => s.key);
    const p = () => payload.product || {};

    const actions = () => {
      const pr = p();
      const live = pr.published && !pr.deleted && pr.path;
      return [live ? { label: "Preview", href: pr.path, newTab: true } : { label: "Preview", act: "preview" },
        ...(pr.deleted ? [] : [pr.published ? { label: "Unpublish", act: "draft" } : { label: "Publish", act: "publish", primary: true }])];
    };
    const menu = () => {
      const pr = p();
      return [{ label: "Back to project", act: "back" }, ...(pr.published && !pr.deleted ? [{ label: "Back to draft", act: "draft" }] : []),
        ...(pr.deleted ? [] : [{ label: "Remove product", act: "remove", danger: true }])];
    };
    function header() {
      ws.setTitle(p().title || "Untitled product");
      ws.setSubtitle(payload.project && payload.project.name ? `${payload.project.name}${payload.creator && payload.creator.name ? ` · ${payload.creator.name}` : ""}` : "");
      ws.setStatus(K().status(p()));
      ws.setActions(actions());
      ws.setMenu(menu());
      const n = ((payload.readiness || {}).blocking || []).length;
      ws.setBadge("release", n ? String(n) : "", `${n} thing${n === 1 ? "" : "s"} to fix before release`);
    }

    function show(key) {
      leave();
      const sec = sections.find((s) => s.key === key) || sections[0];
      history.replaceState(null, "", `#product=${encodeURIComponent(id)}&section=${sec.key}`);
      ws.body.innerHTML = `<section class="sw-section" aria-labelledby="sw-h">
        <h2 class="sw-heading" id="sw-h" tabindex="-1" data-ws-heading>${e(sec.label)}</h2>
        ${sec.hint ? `<p class="sw-hint">${e(sec.hint)}</p>` : ""}
        <p class="msg" data-sw-note role="status"></p>
        <div class="sw-content" data-sw-content></div></section>`;
      const el = ws.body.querySelector("[data-sw-content]");
      const mod = (window.GS.studioSections || {})[sec.key];
      if (!mod || typeof mod.draw !== "function") {
        el.innerHTML = `<p class="msg">This section isn't available right now. Reload the page, or try again in a little while.</p>`;
        return;
      }
      if (window.GS.skeleton) window.GS.skeleton.pending(el, "panel", 2);
      try {
        const out = mod.draw(el, ctx);
        if (typeof out === "function") leaving = out;
      } catch {
        el.innerHTML = `<p class="msg error">This section couldn't open. Reload the page and try again.</p>`;
      }
    }

    async function reload({ redraw = false } = {}) {
      const res = await api(url);
      if (res.ok) { payload = res.data; header(); if (redraw) show(ws.current()); }
      return res;
    }

    function note(text, error = false) {
      const m = ws.body.querySelector("[data-sw-note]");
      if (m) window.GS.say(m.parentElement, text, error);
    }

    // Publish, back to draft, pause, resume, remove: the server checks readiness and says what blocks.
    async function release(act, btn) {
      const body = BODIES[act];
      if (!body) return null;
      if (act === "remove" && !confirm("Remove this product from the store? People who already have it keep their files.")) return null;
      if (btn) btn.disabled = true;
      const res = await api(url, { method: "PATCH", body });
      if (btn) btn.disabled = false;
      if (!res.ok) {
        const blocking = (res.error && res.error.blocking) || (res.data && res.data.error && res.data.error.blocking) || [];
        if (res.status === 409 && blocking.length) payload.readiness = { ...(payload.readiness || {}), ready: false, blocking };
        if (res.status === 409) ws.current() === "release" ? show("release") : ws.select("release", { focus: true });
        header();
        note(res.error.message, true);
        return res;
      }
      await reload({ redraw: true });
      note({ publish: "It's on sale.", draft: "Back to draft: buyers can't get it until you publish again.", pause: "Sales paused.", resume: "Sales resumed.", remove: "Removed from the store.", restore: "Restored." }[act]);
      return res;
    }

    const ctx = {
      get product() { return payload; },
      get workspace() { return ws; },
      reload,
      go: (key) => ws.select(keys.includes(key) ? key : keys[0], { focus: true }),
      setSave: (state) => ws.setSave(state),
      note,
      release
    };

    const ws = window.GS.workspace.mount(root, {
      label: spec.label, title: p().title, status: K().status(p()),
      groups: [{ items: sections.map((s) => ({ key: s.key, label: s.label })) }],
      current: keys.includes(wanted) ? wanted : "overview",
      actions: [], menu: [],
      onSelect: show,
      onAction(act, btn) {
        if (act === "back") { leave(); location.hash = `products=${encodeURIComponent((payload.project || {}).id || "")}`; return; }
        if (act === "preview") return ctx.go("store");
        release(act, btn);
      }
    });
    header();
    ws.body.addEventListener("click", (ev) => {
      const go = ev.target.closest("[data-sw-go]");
      if (go) return ctx.go(go.dataset.swGo);
      const rel = ev.target.closest("[data-sw-release]");
      if (rel) release(rel.dataset.swRelease, rel);
    });
    show(ws.current());
  }

  window.GS.studioSections = window.GS.studioSections || {};
  window.GS.studioWorkspace = { open, leave };
})();

// The visual builder (GS.builder; docs/builder.md): edits a project's site or a creator's profile on the page itself.
// Toolbar (back, pages, desktop / phone, undo / redo, preview, save, publish), the canvas (js/builder-canvas.js) and a
// side panel with Edit (what is selected, else the page), Add, Site, Files and History. Keeps the draft in memory with
// an undo history; Save sends it to the server, which checks everything (server/sites/document.js) and answers with a
// message naming the place when something isn't right. Needs js/util.js, the shared site modules (js/site-*.js) and
// js/builder-*.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const M = () => window.GS.builderModel;
  const P = () => window.GS.builderPanel;
  const FL = () => window.GS.builderFiles;
  const TABS = [["edit", "Edit"], ["add", "Add"], ["site", "Site"], ["files", "Files"], ["history", "History"]];

  function open(root, target, onBack) {
    const base = target.kind === "profile" ? `/api/studio/creators/${encodeURIComponent(target.id)}` : `/api/studio/projects/${encodeURIComponent(target.id)}`;
    let data = null, doc = null, hist = null, canvas = null, ed = null;
    let pageIndex = 0, selection = null, device = "desktop", tab = "edit", dirty = false, versions = null, timer = 0;

    const say = (text, error = false) => { const m = $(".bx-status", root); if (m) { m.textContent = text; m.className = `bx-status msg${error ? " error" : ""}`; } };
    const ctx = () => ({
      images: new Map(data.files.map((f) => [f.id, f.src])),
      products: new Map(data.products.map((p) => [p.id, p])),
      projects: new Map(data.projects.filter((p) => p.published || (target.kind === "project" && p.id === target.id)).map((p) => [p.id, { name: p.name, path: p.path }]))
    });
    const header = () => (target.kind === "project" ? { base: data.site.path, name: data.site.name, by: { name: data.creator.name, path: `/${data.creator.slug}` } }
      : { base: data.site.path, name: data.site.name, by: null });

    function drawCanvas() {
      if (selection && !(selection.kind === "element" ? M().findElement(doc, pageIndex, selection.id) : M().findSection(doc, pageIndex, selection.id))) selection = null;
      canvas.render({ doc, pageIndex, ctx: ctx(), header: header(), device, selection });
    }

    function drawPanel() {
      const host = $(".bx-panel-body", root);
      const sel = selection;
      let html = "";
      if (tab === "edit") {
        if (sel && sel.kind === "element") { const f = M().findElement(doc, pageIndex, sel.id); html = P().elementPanel(f.element, `pages.${pageIndex}.sections.${f.sectionIndex}.elements.${f.index}`, data); }
        else if (sel && sel.kind === "section") { const f = M().findSection(doc, pageIndex, sel.id); html = P().sectionPanel(f.section, `pages.${pageIndex}.sections.${f.index}`, data); }
        else html = P().pagePanel(doc, pageIndex, data);
      }
      if (tab === "add") html = window.GS.builderAdd.palette(data, { profile: target.kind === "profile" });
      if (tab === "site") html = P().sitePanel(doc, data);
      if (tab === "files") html = FL().filesPanel(data);
      if (tab === "history") html = FL().historyPanel(data, versions);
      host.innerHTML = html;
      root.querySelectorAll(".bx-tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    }

    function drawBar() {
      const s = data.site;
      $(".bx-bar", root).innerHTML = `
        <button class="btn ghost small" type="button" data-action="back">&larr; Studio</button>
        <h2>${e(s.name)} <span class="studio-state" data-live="${s.live}">${s.live ? "Live" : "Draft"}</span></h2>
        <label class="bx-pagepick"><span class="sr-only">Page</span><select data-action="page">${doc.pages.map((p, i) => `<option value="${i}"${i === pageIndex ? " selected" : ""}>${e(p.title || "Untitled")}</option>`).join("")}</select></label>
        ${doc.pages.length < data.options.limits.pagesPerSite ? '<button class="btn ghost small" type="button" data-action="page-add">+ Page</button>' : ""}
        <span class="bx-seg" role="group" aria-label="Device"><button type="button" data-action="device" data-device="desktop" aria-pressed="${device === "desktop"}">Desktop</button><button type="button" data-action="device" data-device="phone" aria-pressed="${device === "phone"}">Phone</button></span>
        <button class="btn ghost small" type="button" data-action="undo"${hist.canUndo() ? "" : " disabled"} aria-keyshortcuts="Control+Z">Undo</button>
        <button class="btn ghost small" type="button" data-action="redo"${hist.canRedo() ? "" : " disabled"} aria-keyshortcuts="Control+Shift+Z">Redo</button>
        ${s.live ? `<a class="btn ghost small" href="${e(s.path)}" target="_blank" rel="noopener">View live</a>` : ""}
        <button class="btn ghost small" type="button" data-action="preview">Preview</button>
        <button class="btn ghost small" type="button" data-action="save">Save</button>
        <button class="btn small" type="button" data-action="publish">Publish</button>
        ${s.live ? '<button class="btn ghost small" type="button" data-action="unpublish">Unpublish</button>' : ""}`;
    }

    const drawAll = () => { drawBar(); drawCanvas(); drawPanel(); };
    // Only the undo and redo buttons, so a click on another toolbar button isn't lost to a redraw (leaving a field fires
    // change just before the click lands).
    const undoState = () => {
      const u = $('[data-action="undo"]', root), r = $('[data-action="redo"]', root);
      if (u) u.disabled = !hist.canUndo();
      if (r) r.disabled = !hist.canRedo();
    };

    // Every finished change: applied to the document, recorded for undo, drawn.
    function commit(fn) {
      fn(doc);
      if (hist.record(doc)) { dirty = true; say("Unsaved changes."); }
      drawAll();
    }

    function select(sel) {
      selection = sel;
      tab = "edit";
      drawCanvas();
      drawPanel();
      if (sel) canvas.scrollTo(sel);
    }

    const restoreFrom = (d) => { if (d) { doc = d; dirty = true; say("Unsaved changes."); drawAll(); } };
    const undo = () => restoreFrom(hist.undo());
    const redo = () => restoreFrom(hist.redo());

    async function save() {
      const res = await api(`${base}/site`, { method: "PUT", body: { document: doc } });
      if (!res.ok) { say(res.error.message, true); return false; }
      doc = res.data.document;
      hist.record(doc);
      data.site.savedAt = res.data.savedAt;
      dirty = false;
      say("Saved.");
      drawAll();
      return true;
    }

    async function upload(input) {
      const file = input.files && input.files[0];
      if (!file) return;
      say("Uploading…");
      const res = await fetch(`/api/studio/creators/${encodeURIComponent(data.creator.id)}/images?filename=${encodeURIComponent(file.name)}`,
        { method: "PUT", body: file, credentials: "same-origin", headers: { "Content-Type": file.type || "application/octet-stream", Accept: "application/json" } }).catch(() => null);
      const body = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) { say((body.error && body.error.message) || "The upload didn't work. Try again.", true); return; }
      data.files.unshift({ id: body.image.id, src: body.image.src, filename: body.image.filename, contentType: body.image.contentType, sizeBytes: body.image.sizeBytes });
      data.storage.usedBytes += body.image.sizeBytes;
      drawPanel();
      say(`${body.image.filename} uploaded.`);
    }

    const SERVER = {
      async publish() {
        if (dirty && !(await save())) return;
        const res = await api(`${base}/publish`, { method: "POST", body: {} });
        if (!res.ok) return say(res.error.message, true);
        data.site.live = true;
        versions = null;
        drawBar();
        say(`Published at ${location.origin}${data.site.path}`);
      },
      async unpublish() {
        if (!confirm("Take this offline? Visitors will no longer see it.")) return;
        const res = await api(`${base}/unpublish`, { method: "POST", body: {} });
        if (!res.ok) return say(res.error.message, true);
        data.site.live = false;
        drawBar();
        say("Unpublished: it's offline.");
      },
      async preview() {
        if (!dirty || await save()) window.open(`${base}/preview?page=${encodeURIComponent(doc.pages[pageIndex].slug)}`, "_blank", "noopener");
      },
      save,
      async template(b) {
        if (!confirm("Replace this draft with the template? Undo brings your draft back.")) return;
        const res = await api(`/api/studio/templates/${encodeURIComponent(b.dataset.id)}`);
        if (!res.ok) return say(res.error.message, true);
        pageIndex = 0;
        selection = null;
        commit((d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, res.data.document); });
        say(`${res.data.label} template in place. Make it yours, then save.`);
      },
      async "file-delete"(b) {
        if (!confirm("Delete this file? If a published page still uses it, it stays there until nothing does.")) return;
        const res = await api(`/api/studio/creators/${encodeURIComponent(data.creator.id)}/images/${encodeURIComponent(b.dataset.id)}`, { method: "DELETE", body: {} });
        if (!res.ok) return say(res.error.message, true);
        const gone = data.files.find((f) => f.id === b.dataset.id);
        data.files = data.files.filter((f) => f.id !== b.dataset.id);
        if (gone && !res.data.kept) data.storage.usedBytes = Math.max(0, data.storage.usedBytes - gone.sizeBytes);
        drawAll();
        say(res.data.kept ? "Deleted. A published page still uses it, so it stays there until nothing does." : "Deleted.");
      },
      async copy(b) { try { await navigator.clipboard.writeText(b.dataset.text); say("Address copied."); } catch { say(b.dataset.text); } },
      async restore(b) {
        if (dirty && !confirm("Restoring replaces your unsaved changes. Go ahead?")) return;
        const res = await api(`${base}/versions/${encodeURIComponent(b.dataset.version)}/restore`, { method: "POST", body: {} });
        if (!res.ok) return say(res.error.message, true);
        doc = res.data.document;
        hist.record(doc);
        dirty = false;
        pageIndex = 0;
        selection = null;
        drawAll();
        say(`Version ${b.dataset.version} is in your draft. Publish to make it live.`);
      },
      async schedule() {
        const v = $("#bx-when", root).value;
        if (!v) return say("Pick a date and time.", true);
        if (dirty && !(await save())) return;
        const res = await api(`${base}/schedule`, { method: "PUT", body: { at: new Date(v).toISOString() } });
        if (!res.ok) return say(res.error.message, true);
        data.site.scheduledAt = res.data.scheduledAt;
        drawPanel();
        say("Scheduled.");
      },
      async unschedule() {
        const res = await api(`${base}/schedule`, { method: "DELETE", body: {} });
        if (!res.ok) return say(res.error.message, true);
        data.site.scheduledAt = null;
        drawPanel();
        say("Schedule cancelled.");
      }
    };

    async function act(b) {
      const a = b.dataset.action;
      if (a === "back") { if (!dirty || confirm("Leave without saving?")) { removeEventListener("beforeunload", guard); removeEventListener("keydown", onKey); onBack(); } return; }
      if (a === "device") { device = b.dataset.device; drawBar(); drawCanvas(); return; }
      if (a === "undo") return undo();
      if (a === "redo") return redo();
      if (a === "pick") return select({ kind: b.dataset.kind, id: b.dataset.id });
      if (ed.has(a)) return ed.run(a, b);
      if (!SERVER[a]) return;
      b.disabled = true;
      try { await SERVER[a](b); } finally { b.disabled = false; }
    }

    function guard(ev) { if (dirty) { ev.preventDefault(); ev.returnValue = ""; } }
    function onKey(ev) { if (root.isConnected) ed.key(ev, { save, undo, redo }); }

    function layout() {
      root.innerHTML = `<div class="bx">
        <div class="bx-bar"></div>
        <p class="bx-status msg" role="status" aria-live="polite"></p>
        <div class="bx-work"><div class="bx-stage"></div>
          <aside class="bx-panel" aria-label="Editor"><div class="bx-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}">${l}</button>`).join("")}</div>
          <div class="bx-panel-body"></div></aside></div></div>`;
      canvas = window.GS.builderCanvas.create($(".bx-stage", root), { select, commit, redraw: drawCanvas, key: onKey, focusField: () => { tab = "edit"; drawPanel(); const f = $(".bx-panel-body textarea, .bx-panel-body input", root); if (f) f.focus(); } });
      ed = window.GS.builderEdit.actions({ doc: () => doc, pageIndex: () => pageIndex, selection: () => selection, select, commit, setPage: (i) => { pageIndex = i; selection = null; drawAll(); } });
      root.onclick = (ev) => {
        const t = ev.target.closest("[data-tab]");
        if (t) { tab = t.dataset.tab; if (tab === "history" && versions === null) loadVersions(); drawPanel(); return; }
        const b = ev.target.closest("button[data-action]");
        if (b) act(b);
      };
      root.oninput = (ev) => {
        const t = ev.target;
        if (!t.dataset.path || t.dataset.action) return;
        ed.input(t);
        dirty = true;
        say("Unsaved changes.");
        clearTimeout(timer);
        timer = setTimeout(drawCanvas, 120);
        if (t.dataset.path === "theme.css") { const p = window.GS.siteCss.check(t.value).problems; const st = $(".bx-css-state", root); if (st) { st.textContent = p[0] || "Looks good."; st.classList.toggle("error", p.length > 0); } }
      };
      root.onchange = (ev) => {
        const t = ev.target;
        if (t.dataset.action === "upload") return upload(t);
        if (t.dataset.action === "page") { pageIndex = Number(t.value); selection = null; return drawAll(); }
        if (t.dataset.action === "color-toggle") return ed.run("color-toggle", t);
        if (t.dataset.path) { hist.record(doc); undoState(); if (t.tagName === "SELECT" || t.type === "checkbox" || t.type === "radio") drawPanel(); }
      };
      addEventListener("keydown", onKey);
      addEventListener("beforeunload", guard);
    }

    async function loadVersions() {
      const res = await api(`${base}/versions`);
      versions = res.ok ? res.data.versions : [];
      if (tab === "history") drawPanel();
    }

    (async () => {
      root.innerHTML = '<p class="msg pending">Loading the editor…</p>';
      const res = await api(`${base}/site`);
      if (!res.ok) { root.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
      data = res.data;
      doc = data.document;
      hist = M().history(doc);
      layout();
      drawAll();
      if (data.site.fresh) { tab = "add"; drawPanel(); say("Pick a template to start, or add sections and elements yourself."); }
    })();
  }

  window.GS.builder = { open };
})();

// Studio site editor (GS.studioEditor, for js/studio.js): edits one project's site document (theme, pages, blocks)
// with forms from js/studio-blocks.js, uploads images, saves the draft, opens the private preview and publishes.
// Typing changes the document in memory; adding, moving or removing things redraws the editor. The server checks
// every save (server/sites/document.js) and shows its message here if something isn't right. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const B = () => window.GS.studioBlocks;

  const getAt = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  const setAt = (obj, path, value) => {
    const keys = path.split(".");
    const last = keys.pop();
    getAt(obj, keys.join(".") || "")[last] = value;
  };
  const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

  function open(root, projectId, onBack) {
    let data = null;
    let page = 0;
    let dirty = false;
    const say = (text, error = false) => { const m = $(".studio-status", root); if (m) { m.textContent = text; m.className = `studio-status msg${error ? " error" : ""}`; } };

    function draw() {
      const d = data.document;
      const p = d.pages[page];
      const o = data.options;
      root.innerHTML = `
        <div class="studio-bar">
          <button class="btn ghost" type="button" data-action="back">&larr; All projects</button>
          <h2>${e(data.project.name)} <span class="studio-state" data-live="${data.project.published}">${data.project.published ? "Live" : "Draft"}</span></h2>
          ${data.project.published ? `<a class="btn ghost" href="${e(data.project.path)}" target="_blank" rel="noopener">View live page</a>` : ""}
          <button class="btn ghost" type="button" data-action="preview">Preview</button>
          <button class="btn ghost" type="button" data-action="save">Save draft</button>
          <button class="btn" type="button" data-action="publish">Publish</button>
          ${data.project.published ? '<button class="btn ghost" type="button" data-action="unpublish">Unpublish</button>' : ""}
        </div>
        <p class="studio-status msg" role="status">${dirty ? "Unsaved changes." : data.savedAt ? "Draft saved." : ""}</p>
        <div class="studio-grid">
          <aside class="panel studio-side">
            <h3>Look</h3>
            <div class="field"><label for="st-preset">Style</label><select id="st-preset" data-path="theme.preset">${o.presets.map((x) => `<option value="${e(x.id)}"${x.id === d.theme.preset ? " selected" : ""}>${e(x.label)}</option>`).join("")}</select></div>
            <div class="field"><label for="st-accent">Accent colour</label><input id="st-accent" type="color" data-path="theme.accent" value="${e(d.theme.accent)}"></div>
            <div class="field"><label for="st-font">Font</label><select id="st-font" data-path="theme.font">${o.fonts.map((x) => `<option value="${e(x.id)}"${x.id === d.theme.font ? " selected" : ""}>${e(x.label)}</option>`).join("")}</select></div>
            <h3>Images</h3>
            <label class="btn ghost small studio-upload">Upload image<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-action="upload" hidden></label>
            <p class="small-print">PNG, JPEG, GIF or WebP, up to ${size(o.limits.imageBytes)} each.</p>
            <ul class="studio-images">${data.images.map((i) => `<li><img src="${e(i.src)}" alt="" loading="lazy"><span>${e(i.filename)} · ${size(i.sizeBytes)}</span>
              <button class="btn ghost small" type="button" data-action="image-delete" data-id="${e(i.id)}">Delete</button></li>`).join("")}</ul>
          </aside>
          <div class="studio-main">
            <nav class="studio-pages" aria-label="Pages">${d.pages.map((x, i) => `<button type="button"${i === page ? ' aria-current="page"' : ""} data-action="page" data-index="${i}">${e(x.title || "Untitled")}</button>`).join("")}
              ${d.pages.length < o.limits.pagesPerSite ? '<button type="button" class="studio-page-add" data-action="page-add">+ Page</button>' : ""}</nav>
            <div class="panel wide">
              <div class="field"><label for="st-title">Page name</label><input id="st-title" data-path="pages.${page}.title" maxlength="60" value="${e(p.title)}"></div>
              ${page ? `<div class="field"><label for="st-slug">Address</label><input id="st-slug" data-path="pages.${page}.slug" maxlength="40" value="${e(p.slug)}" pattern="[a-z0-9]+(-[a-z0-9]+)*">
                <p class="small-print">${e(data.project.path)}/<strong>${e(p.slug || "…")}</strong></p></div>
                <button class="btn ghost small" type="button" data-action="page-delete">Delete this page</button>` : `<p class="small-print">The home page, at ${e(data.project.path)}.</p>`}
            </div>
            ${p.blocks.map((b, i) => `<section class="panel wide studio-block" aria-label="Block ${i + 1}: ${e(B().label(b.type))}"><div class="studio-block-head"><span class="studio-block-n" aria-hidden="true">${i + 1}</span><h3>${e(B().label(b.type))}</h3>
              <button class="btn ghost small" type="button" data-action="up" data-index="${i}"${i ? "" : " disabled"}>&uarr; Up</button>
              <button class="btn ghost small" type="button" data-action="down" data-index="${i}"${i < p.blocks.length - 1 ? "" : " disabled"}>&darr; Down</button>
              <button class="btn ghost small danger" type="button" data-action="remove" data-index="${i}">Remove</button></div>
              ${B().form(b, `pages.${page}.blocks.${i}`, data)}</section>`).join("")
              || `<p class="studio-empty">This page has no blocks yet. Pick one below, a heading or some text is a good start, and press Add block.</p>`}
            <div class="studio-add"><label for="st-add">Add a block</label><select id="st-add">${B().types.map((t) => `<option value="${t}">${e(B().label(t))}</option>`).join("")}</select>
              <button class="btn" type="button" data-action="add">Add block</button>
              <span class="small-print">${p.blocks.length} of ${o.limits.blocksPerPage} blocks</span></div>
          </div>
        </div>`;
    }

    const changed = (redraw = true) => { dirty = true; if (redraw) draw(); else say("Unsaved changes."); };

    async function save() {
      const res = await api(`/api/studio/projects/${encodeURIComponent(projectId)}/site`, { method: "PUT", body: { document: data.document } });
      if (!res.ok) { say(res.error.message, true); return false; }
      data.document = res.data.document;
      data.savedAt = res.data.savedAt;
      dirty = false;
      return true;
    }

    async function act(btn) {
      const a = btn.dataset.action;
      const blocks = data.document.pages[page].blocks;
      const i = Number(btn.dataset.index);
      if (a === "back") { if (!dirty || confirm("Leave without saving?")) { onbeforeunload = null; onBack(); } return; }
      if (a === "page") { page = i; return draw(); }
      if (a === "page-add") { data.document.pages.push({ slug: `page-${data.document.pages.length + 1}`, title: "New page", blocks: [] }); page = data.document.pages.length - 1; return changed(); }
      if (a === "page-delete") { if (confirm("Delete this page and its blocks?")) { data.document.pages.splice(page, 1); page = 0; changed(); } return; }
      if (a === "add") { if (blocks.length >= data.options.limits.blocksPerPage) return say("This page has as many blocks as it can hold.", true); blocks.push(B().blank($("#st-add", root).value)); return changed(); }
      if (a === "up" || a === "down") { const j = a === "up" ? i - 1 : i + 1; [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; return changed(); }
      if (a === "remove") { if (confirm(`Remove this ${B().label(blocks[i].type)} block? It's gone once you save.`)) { blocks.splice(i, 1); changed(); } return; }
      if (a === "list-add") { getAt(data.document, btn.dataset.path).push(B().blankItem(btn.dataset.path.split(".").pop())); return changed(); }
      if (a === "list-remove") { getAt(data.document, btn.dataset.path).splice(i, 1); return changed(); }
      btn.disabled = true;
      try {
        if (a === "save") { if (await save()) { draw(); say("Draft saved."); } }
        if (a === "preview") { if (!dirty || await save()) window.open(`/api/studio/projects/${encodeURIComponent(projectId)}/preview?page=${encodeURIComponent(data.document.pages[page].slug)}`, "_blank", "noopener"); }
        if (a === "publish" && (!dirty || await save())) {
          const res = await api(`/api/studio/projects/${encodeURIComponent(projectId)}/publish`, { method: "POST", body: {} });
          if (!res.ok) return say(res.error.message, true);
          data.project.published = true;
          draw();
          say(`Published at ${location.origin}${data.project.path}`);
        }
        if (a === "unpublish") { const res = await api(`/api/studio/projects/${encodeURIComponent(projectId)}/unpublish`, { method: "POST", body: {} }); if (res.ok) { data.project.published = false; draw(); say("Unpublished: the page is offline."); } else say(res.error.message, true); }
        if (a === "image-delete" && confirm("Delete this image? Pages showing it will lose it.")) {
          const res = await api(`/api/studio/creators/${encodeURIComponent(data.creator.id)}/images/${encodeURIComponent(btn.dataset.id)}`, { method: "DELETE", body: {} });
          if (!res.ok) return say(res.error.message, true);
          data.images = data.images.filter((x) => x.id !== btn.dataset.id);
          draw();
        }
      } finally {
        btn.disabled = false;
      }
    }

    async function upload(input) {
      const file = input.files && input.files[0];
      if (!file) return;
      say("Uploading…");
      const res = await fetch(`/api/studio/creators/${encodeURIComponent(data.creator.id)}/images?filename=${encodeURIComponent(file.name)}`,
        { method: "PUT", body: file, credentials: "same-origin", headers: { "Content-Type": file.type || "application/octet-stream", Accept: "application/json" } }).catch(() => null);
      const body = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) return say((body.error && body.error.message) || "The upload didn't work. Try again.", true);
      data.images.unshift({ id: body.image.id, src: body.image.src, filename: body.image.filename, sizeBytes: body.image.sizeBytes });
      draw();
      say(dirty ? "Image uploaded. You have unsaved changes." : "Image uploaded.");
    }

    root.oninput = (ev) => {
      const t = ev.target;
      if (!t.dataset.path || t.type === "file") return;
      if (t.dataset.toggle) {
        const list = getAt(data.document, t.dataset.path);
        const at = list.indexOf(t.dataset.toggle);
        if (t.checked && at < 0) list.push(t.dataset.toggle);
        if (!t.checked && at >= 0) list.splice(at, 1);
      } else setAt(data.document, t.dataset.path, /\.level$/.test(t.dataset.path) ? Number(t.value) : t.value);
      changed(false);
    };
    // Closing the tab or reloading with unsaved changes asks first (the browser shows its own wording).
    onbeforeunload = (ev) => { if (dirty) { ev.preventDefault(); ev.returnValue = ""; } };
    root.onchange = (ev) => { if (ev.target.dataset.action === "upload") upload(ev.target); };
    root.onclick = (ev) => { const btn = ev.target.closest("button[data-action]"); if (btn) act(btn); };

    (async () => {
      root.innerHTML = '<p class="msg pending">Loading the editor…</p>';
      const res = await api(`/api/studio/projects/${encodeURIComponent(projectId)}/site`);
      if (!res.ok) { root.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
      data = res.data;
      draw();
    })();
  }

  window.GS.studioEditor = { open };
})();

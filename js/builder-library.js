// The visual builder's Library tab (GS.builderLibrary; docs/builder.md, phase 8): the community library of elements,
// sections and whole-site templates other creators share, free or for sale. Search and filter, preview a piece in the
// tab's own frame (drawn by the shared renderer), use it (an element goes into the selected section, a section after
// the selected one, a template replaces the draft after asking: all of it undoable), buy a paid one in the AutoStacc
// store, report one, or delete your own. shareForm() is the form for sharing what is selected (or the whole site).
// Buttons carry data-action for js/builder.js. Needs js/util.js, js/site-render.js and js/builder-model.js.
(function () {
  "use strict";

  const { escapeHTML: e } = window.GS;
  const money = (c) => `$${(c / 100).toFixed(2)}`;
  const KINDS = [["", "Everything"], ["element", "Elements"], ["section", "Sections"], ["template", "Whole sites"]];

  function panel(lib) {
    const items = lib.pieces === null ? '<p class="msg pending">Loading the library…</p>' : lib.pieces.length ? `<ul class="bx-pieces">${lib.pieces.map((p) => `<li>
      <div><strong>${e(p.title)}</strong><small>${e(p.kind === "template" ? "Whole site" : p.kind === "section" ? "Section" : "Element")} · by ${e(p.creator.name)}${p.installs ? ` · used by ${p.installs}` : ""}</small>
        ${p.description ? `<span>${e(p.description)}</span>` : ""}</div>
      <div class="bx-row">
        <button class="btn ghost small" type="button" data-action="lib-preview" data-id="${e(p.id)}">${p.owned ? "Preview" : "Preview layout"}</button>
        ${p.owned ? `<button class="btn small" type="button" data-action="lib-use" data-id="${e(p.id)}">Use</button>`
          : `<a class="btn small" href="${e(p.productPath)}" target="_blank" rel="noopener">Buy ${e(money(p.priceCents))}</a>`}
        ${p.mine ? `<button class="btn ghost small danger" type="button" data-action="lib-delete" data-id="${e(p.id)}">Delete</button>`
          : `<button class="btn ghost small" type="button" data-action="lib-report" data-id="${e(p.id)}">Report</button>`}
      </div></li>`).join("")}</ul>` : "<p>Nothing here yet.</p>";
    return `<div class="bx-head"><h3>Library</h3></div>
      <p class="small-print">Pieces other creators share. Free ones are yours to use; paid ones after you buy them in the store, on any of your own sites.</p>
      <div class="bx-row"><label class="field"><span class="sr-only">Search</span><input type="search" data-lib="q" placeholder="Search" value="${e(lib.q)}"></label>
        <label class="field"><span class="sr-only">Kind</span><select data-lib="kind">${KINDS.map(([v, l]) => `<option value="${v}"${v === lib.kind ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <iframe class="bx-piece-frame" title="Preview of a library piece" sandbox=""${lib.preview ? "" : " hidden"}></iframe>
      ${items}`;
  }

  // A document that shows one piece, for the preview frame.
  // A piece you may use shows as it is; a paid one you don't own shows its layout only (the server sends an outline).
  function previewDoc(piece, theme) {
    const M = window.GS.builderModel;
    const shown = piece.fragment || piece.outline;
    if (piece.kind === "template") return shown;
    const section = piece.kind === "section" ? shown : { ...M.newSection("blank"), rows: Math.max(4, shown.box.h + 1), elements: [shown] };
    return { version: 2, theme, nav: { items: [] }, pages: [{ slug: "", title: "Preview", sections: [section] }] };
  }

  function preview(frame, piece, theme) {
    const doc = previewDoc(piece, theme);
    const ctx = { images: new Map(piece.files.map((f) => [f.id, f.src])), products: new Map(), projects: new Map(), editor: true };
    frame.hidden = false;
    frame.srcdoc = window.GS.siteRender.pageHtml({ siteUrl: location.origin, path: "/", title: "Preview", description: "", indexable: false, doc, page: doc.pages[0], ctx,
      header: { base: "/", name: piece.title, by: null }, runtime: null });
  }

  // What using a piece does to the draft. Returns the selection to show, or a page index for a template.
  function insert(d, pageIndex, selection, got) {
    const M = window.GS.builderModel;
    const page = d.pages[pageIndex];
    if (got.kind === "template") {
      Object.keys(d).forEach((k) => delete d[k]);
      Object.assign(d, got.fragment);
      return { page: 0 };
    }
    const where = selection && selection.kind === "element" ? M.findElement(d, pageIndex, selection.id) : null;
    const secAt = selection && selection.kind === "section" ? M.findSection(d, pageIndex, selection.id).index : where ? where.sectionIndex : page.sections.length - 1;
    if (got.kind === "section") {
      const s = { ...got.fragment, id: M.newId("s"), elements: got.fragment.elements.map((x) => ({ ...x, id: M.newId("e") })) };
      page.sections.splice(secAt + 1, 0, s);
      return { kind: "section", id: s.id };
    }
    if (!page.sections.length) page.sections.push(M.newSection("blank"));
    const section = page.sections[Math.max(0, secAt)];
    const spot = M.freeSpot(section, got.fragment.box.w, got.fragment.box.h);
    const el = { ...got.fragment, id: M.newId("e"), box: { ...got.fragment.box, ...spot } };
    section.elements.push(el);
    section.rows = Math.max(section.rows, el.box.y + el.box.h);
    return { kind: "element", id: el.id };
  }

  function shareForm(what, data) {
    const label = what.kind === "template" ? "this whole site" : what.kind === "section" ? "this section" : "this element";
    const projects = data.projects;
    return `<form class="bx-share" data-share data-kind="${e(what.kind)}" data-id="${e(what.id || "")}">
      <h4 class="bx-sub">Share ${e(label)} to the library</h4>
      <div class="field"><label for="bx-sh-title">Title</label><input id="bx-sh-title" name="title" required minlength="3" maxlength="80"></div>
      <div class="field"><label for="bx-sh-desc">Description</label><textarea id="bx-sh-desc" name="description" maxlength="500" rows="3"></textarea></div>
      ${data.library.canSell && projects.length ? `<div class="field"><label for="bx-sh-price">Price in USD (0 = free)</label><input id="bx-sh-price" name="price" type="number" min="0" max="500" step="0.01" value="0"></div>
        <div class="field"><label for="bx-sh-project">Sell it under</label><select id="bx-sh-project" name="project">${projects.map((p) => `<option value="${e(p.id)}">${e(p.name)}</option>`).join("")}</select></div>` : ""}
      <p class="small-print">Everyone on AutoStacc can use it. Your images in it stay yours and count against your storage. Your products, projects and audio players are left out. Buyers may use paid pieces on their own sites only.</p>
      <div class="bx-row"><button class="btn small" type="submit">Share</button><button class="btn ghost small" type="button" data-action="share-cancel">Cancel</button></div></form>`;
  }

  // The tab's state and what its buttons do. ed: { api, data, doc(), pageIndex(), selection(), commit(fn), select(sel),
  // setPage(i), say(text, error), redraw(), root }.
  function controller(ed) {
    const lib = { pieces: null, q: "", kind: "", preview: null, share: null };
    const find = (id) => (lib.pieces || []).find((p) => p.id === id);
    const creatorId = ed.data.creator.id;
    let timer = 0;

    async function load() {
      const p = new URLSearchParams({ creatorId, ...(lib.q ? { q: lib.q } : {}), ...(lib.kind ? { kind: lib.kind } : {}) });
      const res = await ed.api(`/api/studio/library?${p}`);
      lib.pieces = res.ok ? res.data.pieces : [];
      if (!res.ok) ed.say(res.error.message, true);
      ed.redraw();
    }

    // What "Share" sends: the selected element or section, or the whole draft.
    function fragmentFor(what) {
      const M = window.GS.builderModel;
      const d = ed.doc();
      if (what.kind === "template") return d;
      if (what.kind === "section") return M.findSection(d, ed.pageIndex(), what.id).section;
      return M.findElement(d, ed.pageIndex(), what.id).element;
    }

    const actions = {
      "lib-preview": (b) => { const p = find(b.dataset.id); if (!p) return; lib.preview = p.id; ed.redraw(); preview(ed.root.querySelector(".bx-piece-frame"), p, ed.doc().theme); },
      async "lib-use"(b) {
        const p = find(b.dataset.id);
        if (p && p.kind === "template" && !confirm("Replace this draft with the template? Undo brings your draft back.")) return;
        const res = await ed.api(`/api/studio/creators/${encodeURIComponent(creatorId)}/library/${encodeURIComponent(b.dataset.id)}/install`, { method: "POST", body: {} });
        if (!res.ok) return ed.say(res.error.message, true);
        for (const f of res.data.files) if (!ed.data.files.some((x) => x.id === f.id)) ed.data.files.push(f);
        let where;
        ed.commit((d) => { where = insert(d, ed.pageIndex(), ed.selection(), res.data); });
        if (where.page !== undefined) ed.setPage(where.page); else ed.select(where);
        ed.say(`${res.data.title} added. Make it yours, then save.`);
      },
      async "lib-report"(b) {
        const reason = prompt("What's wrong with it? (AutoStacc reads every report.)");
        if (!reason) return;
        const res = await ed.api(`/api/studio/library/${encodeURIComponent(b.dataset.id)}/report`, { method: "POST", body: { reason } });
        ed.say(res.ok ? "Thanks: AutoStacc will have a look." : res.error.message, !res.ok);
      },
      async "lib-delete"(b) {
        if (!confirm("Delete this piece from the library? Sites that use it keep it, and people who bought it keep it.")) return;
        const res = await ed.api(`/api/studio/creators/${encodeURIComponent(creatorId)}/library/${encodeURIComponent(b.dataset.id)}`, { method: "DELETE", body: {} });
        if (!res.ok) return ed.say(res.error.message, true);
        ed.say("Deleted from the library.");
        load();
      },
      share: (b) => { lib.share = { kind: b.dataset.kind, id: b.dataset.id || "" }; ed.redraw(); },
      "share-cancel": () => { lib.share = null; ed.redraw(); }
    };

    async function submit(form) {
      const what = { kind: form.dataset.kind, id: form.dataset.id };
      const price = form.price ? Math.round(Number(form.price.value || 0) * 100) : 0;
      const body = { kind: what.kind, title: form.title.value, description: form.description.value, piece: fragmentFor(what), priceCents: price,
        ...(price && form.project ? { projectId: form.project.value } : {}) };
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      const res = await ed.api(`/api/studio/creators/${encodeURIComponent(creatorId)}/library`, { method: "POST", body });
      btn.disabled = false;
      if (!res.ok) return ed.say(res.error.message, true);
      lib.share = null;
      lib.pieces = null;
      ed.say(price ? "Shared and on sale in the store." : "Shared: everyone on AutoStacc can use it now.");
      ed.redraw();
    }

    function onInput(t) {
      if (!t.dataset.lib) return false;
      lib[t.dataset.lib] = t.value;
      clearTimeout(timer);
      timer = setTimeout(load, t.dataset.lib === "q" ? 300 : 0);
      return true;
    }

    return { lib, load, actions, submit, onInput, html: () => panel(lib), shareHtml: () => (lib.share ? shareForm(lib.share, ed.data) : "") };
  }

  window.GS.builderLibrary = { controller, insert, preview };
})();

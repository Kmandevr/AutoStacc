// The visual builder's editing operations (GS.builderEdit; docs/builder.md): what each panel button, input and key does
// to the site document. Each finished change goes through ed.commit(fn) (js/builder.js), which records it for undo.
// Typing in the panel changes the document at once (the page redraws) and is recorded when the field is left.
// Needs js/builder-model.js and js/builder-fields.js.
(function () {
  "use strict";

  const M = () => window.GS.builderModel;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ed: { doc(), pageIndex(), selection(), select(sel), commit(fn), setPage(i), redrawPanel() }
  function actions(ed) {
    const page = (d) => d.pages[ed.pageIndex()];
    const targetSection = (d) => {
      const sel = ed.selection();
      if (sel && sel.kind === "section") return M().findSection(d, ed.pageIndex(), sel.id).section;
      if (sel && sel.kind === "element") return M().findElement(d, ed.pageIndex(), sel.id).section;
      if (!page(d).sections.length) page(d).sections.push(M().newSection("blank"));
      return page(d).sections[0];
    };

    const ops = {
      "add-element": (d, b) => {
        const s = targetSection(d);
        const el = M().newElement(b.dataset.type, s);
        s.elements.push(el);
        s.rows = Math.max(s.rows, el.box.y + el.box.h);
        return { kind: "element", id: el.id };
      },
      "add-section": (d, b) => {
        const s = M().newSection(b.dataset.layout);
        const sel = ed.selection();
        const at = sel ? (sel.kind === "section" ? M().findSection(d, ed.pageIndex(), sel.id).index : M().findElement(d, ed.pageIndex(), sel.id).sectionIndex) + 1 : page(d).sections.length;
        page(d).sections.splice(at, 0, s);
        return { kind: "section", id: s.id };
      },
      delete: (d) => {
        const sel = ed.selection();
        if (!sel) return undefined;
        if (sel.kind === "element") { const f = M().findElement(d, ed.pageIndex(), sel.id); f.section.elements.splice(f.index, 1); }
        else page(d).sections.splice(M().findSection(d, ed.pageIndex(), sel.id).index, 1);
        return null;
      },
      duplicate: (d) => {
        const sel = ed.selection();
        if (!sel) return undefined;
        if (sel.kind === "element") {
          const f = M().findElement(d, ed.pageIndex(), sel.id);
          const copy = M().duplicateElement(f.element);
          f.section.elements.push(copy);
          f.section.rows = Math.max(f.section.rows, copy.box.y + copy.box.h);
          return { kind: "element", id: copy.id };
        }
        const f = M().findSection(d, ed.pageIndex(), sel.id);
        const copy = M().duplicateSection(f.section);
        page(d).sections.splice(f.index + 1, 0, copy);
        return { kind: "section", id: copy.id };
      },
      forward: (d) => { const f = M().findElement(d, ed.pageIndex(), ed.selection().id); if (f.index < f.section.elements.length - 1) f.section.elements.splice(f.index + 1, 0, ...f.section.elements.splice(f.index, 1)); },
      backward: (d) => { const f = M().findElement(d, ed.pageIndex(), ed.selection().id); if (f.index > 0) f.section.elements.splice(f.index - 1, 0, ...f.section.elements.splice(f.index, 1)); },
      "section-up": (d) => { const f = M().findSection(d, ed.pageIndex(), ed.selection().id); if (f.index > 0) page(d).sections.splice(f.index - 1, 0, ...page(d).sections.splice(f.index, 1)); },
      "section-down": (d) => { const f = M().findSection(d, ed.pageIndex(), ed.selection().id); if (f.index < page(d).sections.length - 1) page(d).sections.splice(f.index + 1, 0, ...page(d).sections.splice(f.index, 1)); },
      "phone-order-reset": (d) => { const f = M().findElement(d, ed.pageIndex(), ed.selection().id); f.section.elements.forEach((x) => { x.phone = { ...x.phone, order: null }; }); },
      "list-add": (d, b) => { M().getAt(d, b.dataset.path).push(window.GS.builderFields.BLANK_ITEM[b.dataset.kind]()); },
      "list-remove": (d, b) => { M().getAt(d, b.dataset.path).splice(Number(b.dataset.index), 1); },
      "color-toggle": (d, b) => { M().setAt(d, b.dataset.path, b.checked ? "#888888" : ""); },
      "nav-add-page": (d) => { const p = d.pages.find((x) => !d.nav.items.some((n) => n.page === x.slug)) || d.pages[0]; d.nav.items.push({ label: p.title, page: p.slug }); },
      "nav-add-link": (d) => { d.nav.items.push({ label: "Store", url: "/shop" }); },
      "nav-up": (d, b) => { const i = Number(b.dataset.index); if (i > 0) d.nav.items.splice(i - 1, 0, ...d.nav.items.splice(i, 1)); },
      "page-add": (d) => {
        const used = new Set(d.pages.map((p) => p.slug));
        let n = d.pages.length + 1;
        while (used.has(`page-${n}`)) n++;
        d.pages.push({ slug: `page-${n}`, title: "New page", description: "", sections: [M().newSection("blank")] });
        return { page: d.pages.length - 1 };
      },
      "page-delete": (d) => { if (ed.pageIndex() > 0) { const gone = d.pages.splice(ed.pageIndex(), 1)[0]; d.nav.items = d.nav.items.filter((n) => n.page !== gone.slug); return { page: 0 }; } return undefined; }
    };

    function run(action, button) {
      let result;
      ed.commit((d) => { result = ops[action](d, button); });
      if (result && result.page !== undefined) ed.setPage(result.page);
      else if (result !== undefined) ed.select(result);
    }

    // A value typed or picked in the panel, at its data-path, converted the way the input says.
    function input(t) {
      const d = ed.doc();
      let value = t.value;
      if (t.dataset.toggle) {
        const list = M().getAt(d, t.dataset.path);
        const at = list.indexOf(t.dataset.toggle);
        if (t.checked && at < 0) list.push(t.dataset.toggle);
        if (!t.checked && at >= 0) list.splice(at, 1);
        return;
      }
      if (t.type === "checkbox") value = t.checked;
      else if (t.dataset.number !== undefined) value = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
      else if (t.dataset.classes !== undefined) value = value.split(/\s+/).filter(Boolean);
      M().setAt(d, t.dataset.path, value);
    }

    // Keys on the page or the editor (not while typing in a field): delete, duplicate, nudge, deselect, undo / redo, save.
    function key(e, more) {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); more.save(); return; }
      if (typing) return;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) more.redo(); else more.undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); more.redo(); return; }
      const sel = ed.selection();
      if (!sel) return;
      if (e.key === "Escape") { ed.select(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); run("delete"); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); run("duplicate"); return; }
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (dir && sel.kind === "element") {
        e.preventDefault();
        ed.commit((d) => { const f = M().findElement(d, ed.pageIndex(), sel.id); const b = f.element.box; b.x = clamp(b.x + dir[0], 0, 12 - b.w); b.y = clamp(b.y + dir[1], 0, 199); });
      }
    }

    return { run, input, key, has: (a) => Boolean(ops[a]) };
  }

  window.GS.builderEdit = { actions };
})();

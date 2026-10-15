// The visual builder's canvas (GS.builderCanvas; docs/builder.md): the page itself, drawn by the shared renderer
// (js/site-render.js) in a same-origin iframe with no scripts of its own, so it looks exactly as visitors will see it.
// Click to select an element or a section; drag to move on the 12-column grid (or into another section); drag the
// handles to resize; drag a section's bottom edge to make it taller; double-click a heading or button to type in place.
// In phone view, dragging reorders and the bottom handle sets a phone height. Every finished gesture goes back through
// hooks.commit(change), so it lands in undo / redo. Needs js/site-render.js and js/builder-model.js.
(function () {
  "use strict";

  const R = () => window.GS.siteRender;
  const M = () => window.GS.builderModel;
  const HANDLES = ["e", "w", "s", "se", "sw"];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function create(host, hooks) {
    const frame = document.createElement("iframe");
    frame.className = "bx-frame";
    frame.title = "Your page, as visitors will see it. Select something to edit it.";
    host.append(frame);
    let state = null;
    let headKey = "";
    let doc = null;
    let drag = null;

    const pageHead = () => JSON.stringify([state.doc.theme, state.device]);
    const fullHtml = () => R().pageHtml({ siteUrl: location.origin, path: state.header.base, title: "Editing", description: "", indexable: false,
      doc: state.doc, page: state.doc.pages[state.pageIndex], ctx: { ...state.ctx, editor: true }, header: state.header, runtime: null })
      .replace("</head>", '<link rel="stylesheet" href="/css/builder-canvas.css"></head>');

    function render(next) {
      state = next;
      frame.dataset.device = state.device;
      if (!doc || pageHead() !== headKey) {
        headKey = pageHead();
        const scroll = doc ? doc.scrollingElement.scrollTop : 0;
        frame.onload = () => { doc = frame.contentDocument; wire(); decorate(); doc.scrollingElement.scrollTop = scroll; };
        frame.srcdoc = fullHtml();
        return;
      }
      const site = doc.querySelector(".cs-site");
      const tpl = doc.createElement("template");
      tpl.innerHTML = R().bodyHtml(state.doc, state.doc.pages[state.pageIndex], { ...state.ctx, editor: true }, state.header);
      site.replaceWith(tpl.content.firstElementChild);
      decorate();
    }

    // Selection marks and handles, after each draw.
    function decorate() {
      if (!doc) return;
      doc.documentElement.classList.toggle("bx-phone", state.device === "phone");
      doc.querySelectorAll(".bx-sel").forEach((n) => n.classList.remove("bx-sel"));
      doc.querySelectorAll(".bx-h").forEach((n) => n.remove());
      const sel = state.selection;
      if (!sel) return;
      const node = doc.querySelector(sel.kind === "element" ? `[data-el="${CSS.escape(sel.id)}"]` : `[data-sec="${CSS.escape(sel.id)}"]`);
      if (!node) return;
      node.classList.add("bx-sel");
      const kinds = sel.kind === "section" ? ["rows"] : state.device === "phone" ? ["s"] : HANDLES;
      kinds.forEach((k) => { const h = doc.createElement("span"); h.className = `bx-h bx-h-${k}`; h.dataset.h = k; node.append(h); });
    }

    // Grid geometry of a section, measured from the browser's own layout: column starts and row starts in px.
    function geometry(sectionNode) {
      const grid = sectionNode.querySelector(".cs-grid");
      const cs = getComputedStyle(grid);
      const box = grid.getBoundingClientRect();
      const cols = cs.gridTemplateColumns.split(" ").map(parseFloat);
      const rows = cs.gridTemplateRows.split(" ").map(parseFloat);
      const gap = parseFloat(cs.columnGap) || 0;
      const left = box.left + parseFloat(cs.paddingLeft);
      const colStarts = cols.map((_, i) => left + cols.slice(0, i).reduce((a, b) => a + b + gap, 0));
      const rowStarts = rows.map((_, i) => box.top + rows.slice(0, i).reduce((a, b) => a + b, 0));
      const colAt = (x) => clamp(colStarts.findLastIndex((s) => s <= x + (cols[0] + gap) / 2), 0, 11);
      const rowAt = (y) => (y < box.top ? 0 : Math.max(0, rowStarts.findLastIndex((s) => s <= y + 12)) + (y > box.bottom ? Math.round((y - box.bottom) / 24) : 0));
      return { colAt, rowAt, colUnit: (cols[0] || 0) + gap };
    }

    function wire() {
      doc.addEventListener("click", (e) => { if (e.target.closest("a")) e.preventDefault(); });
      doc.addEventListener("submit", (e) => e.preventDefault());
      doc.addEventListener("dragstart", (e) => e.preventDefault());
      doc.addEventListener("pointerdown", down);
      doc.addEventListener("dblclick", inline);
      doc.addEventListener("keydown", (e) => hooks.key(e));
    }

    function down(e) {
      if (e.button !== 0 || e.target.isContentEditable) return;
      // No text selection and no native drag of links and images while placing things.
      e.preventDefault();
      const handle = e.target.closest(".bx-h");
      const elNode = e.target.closest("[data-el]");
      const secNode = e.target.closest("[data-sec]");
      if (!handle && !elNode && !secNode) { hooks.select(null); return; }
      if (!handle) {
        const sel = elNode ? { kind: "element", id: elNode.dataset.el } : { kind: "section", id: secNode.dataset.sec };
        if (!state.selection || state.selection.id !== sel.id) hooks.select(sel);
        if (!elNode) return;
      }
      // Selecting draws the page again: drag the node that is there now.
      const target = handle ? handle.parentElement : doc.querySelector(`[data-el="${CSS.escape(elNode.dataset.el)}"]`);
      if (!target) return;
      const found = target.dataset.el ? M().findElement(state.doc, state.pageIndex, target.dataset.el) : null;
      const sec = target.dataset.sec ? M().findSection(state.doc, state.pageIndex, target.dataset.sec) : null;
      drag = { mode: handle ? handle.dataset.h : "move", node: target, startX: e.clientX, startY: e.clientY, moved: false,
        box: found ? { ...found.element.box } : null, id: target.dataset.el || target.dataset.sec, rows: sec ? sec.section.rows : 0,
        geo: geometry(target.closest("[data-sec]")), height: target.getBoundingClientRect().height };
      target.setPointerCapture(e.pointerId);
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up, { once: true });
      target.addEventListener("pointercancel", () => { drag = null; doc.documentElement.classList.remove("bx-dragging"); target.removeEventListener("pointermove", move); hooks.redraw(); }, { once: true });
    }

    // While dragging only the dragged node's grid placement changes; the document changes once, on release.
    function next(e, d) {
      const { geo, box, mode } = d;
      if (mode === "rows") return { rows: clamp(d.rows + Math.round((e.clientY - d.startY) / 24), 1, 200) };
      if (state.device === "phone") return mode === "s" ? { ph: clamp(Math.round((d.height + e.clientY - d.startY) / 24), 0, 100) } : { y: e.clientY };
      const dc = Math.round((e.clientX - d.startX) / (geo.colUnit || 1));
      const startRow = box.y;
      const dr = geo.rowAt(e.clientY) - geo.rowAt(d.startY);
      const b = { ...box };
      if (mode === "move") { b.x = clamp(box.x + dc, 0, 12 - box.w); b.y = clamp(startRow + dr, 0, 199); return { box: b }; }
      // A resize handle: e, w, s, se or sw.
      if (mode.endsWith("e")) b.w = clamp(box.w + dc, 1, 12 - box.x);
      if (mode.endsWith("w")) { const x = clamp(box.x + dc, 0, box.x + box.w - 1); b.w = box.w + box.x - x; b.x = x; }
      if (mode.startsWith("s")) b.h = clamp(box.h + dr, 1, 100);
      return { box: b };
    }

    function move(e) {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
      drag.moved = true;
      doc.documentElement.classList.add("bx-dragging");
      const n = next(e, drag);
      if (n.box) { drag.node.style.gridColumn = `${n.box.x + 1} / span ${n.box.w}`; drag.node.style.gridRow = `${n.box.y + 1} / span ${n.box.h}`; }
      if (n.rows) drag.node.style.setProperty("--rows", Math.max(n.rows, 1));
      if (n.ph !== undefined) drag.node.style.minHeight = `${n.ph * 24}px`;
      if (n.y !== undefined) drag.node.style.transform = `translateY(${e.clientY - drag.startY}px)`;
    }

    function up(e) {
      const d = drag;
      drag = null;
      doc.documentElement.classList.remove("bx-dragging");
      d.node.removeEventListener("pointermove", move);
      if (!d.moved) return;
      const n = next(e, d);
      const over = doc.elementFromPoint(e.clientX, e.clientY);
      const intoNode = over && over.closest("[data-sec]");
      hooks.commit((docu) => {
        if (d.mode === "rows") { M().findSection(docu, state.pageIndex, d.id).section.rows = n.rows; return; }
        const found = M().findElement(docu, state.pageIndex, d.id);
        if (!found) return;
        if (state.device === "phone") {
          if (n.ph !== undefined) { found.element.phone = { ...found.element.phone, h: n.ph }; return; }
          reorderPhone(found.section, d.id, e.clientY);
          return;
        }
        found.element.box = n.box;
        const into = intoNode && intoNode.dataset.sec !== found.section.id && M().findSection(docu, state.pageIndex, intoNode.dataset.sec);
        if (into && d.mode === "move") {
          found.section.elements.splice(found.index, 1);
          const g = geometry(intoNode);
          found.element.box = { ...n.box, y: g.rowAt(e.clientY) };
          into.section.elements.push(found.element);
        }
      });
    }

    // Phone order: where the element was dropped among its section's elements as phones show them.
    function reorderPhone(section, id, y) {
      const nodes = [...doc.querySelectorAll(`[data-sec="${CSS.escape(section.id)}"] [data-el]`)].filter((n) => n.dataset.el !== id && n.offsetParent);
      const order = nodes.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((n) => n.dataset.el);
      const at = order.findIndex((other) => doc.querySelector(`[data-el="${CSS.escape(other)}"]`).getBoundingClientRect().top + 10 > y);
      order.splice(at < 0 ? order.length : at, 0, id);
      section.elements.forEach((el) => { const i = order.indexOf(el.id); el.phone = { ...el.phone, order: i < 0 ? null : i }; });
    }

    // Type straight into a heading or a button; Enter or leaving it keeps the words, Escape puts them back.
    function inline(e) {
      const node = e.target.closest("[data-el]");
      if (!node) return;
      const found = M().findElement(state.doc, state.pageIndex, node.dataset.el);
      if (!found) return;
      const type = found.element.type;
      if (type === "text" || type === "tabs" || type === "accordion") { hooks.focusField(); return; }
      const field = type === "heading" ? "text" : type === "button" ? "label" : null;
      const target = field && node.querySelector(type === "heading" ? ".cs-h" : "a");
      if (!target) return;
      const before = target.textContent;
      target.contentEditable = "plaintext-only";
      target.focus();
      doc.getSelection().selectAllChildren(target);
      const finish = (keep) => {
        target.contentEditable = "false";
        const value = target.textContent.replace(/\s+/g, " ").trim();
        if (!keep || !value) { target.textContent = before; return; }
        hooks.commit((docu) => { const f = M().findElement(docu, state.pageIndex, node.dataset.el); if (f) f.element[field] = value.slice(0, field === "label" ? 60 : 120); });
      };
      target.addEventListener("keydown", (k) => { if (k.key === "Enter") { k.preventDefault(); target.blur(); } if (k.key === "Escape") { finish(false); target.blur(); } k.stopPropagation(); });
      target.addEventListener("blur", () => finish(target.contentEditable === "plaintext-only"), { once: true });
    }

    const scrollTo = (sel) => {
      const node = doc && doc.querySelector(sel.kind === "element" ? `[data-el="${CSS.escape(sel.id)}"]` : `[data-sec="${CSS.escape(sel.id)}"]`);
      if (node) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };

    return { render, scrollTo, frame };
  }

  window.GS.builderCanvas = { create };
})();

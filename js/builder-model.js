// The visual builder's model (GS.builderModel; docs/builder.md): what each element is called and starts as, the
// section layouts the Add panel offers, new ids, finding and moving things in a site document, a free spot on the grid,
// and the undo / redo history (whole-document snapshots). Pure, no DOM: js/builder*.js use it in the Studio and unit
// tests load it in Node. The server checks every save (server/sites/document.js); this only makes editing pleasant.
(function (root) {
  "use strict";

  // label, group in the Add panel, default size { w, h } in grid units, and blank fields.
  const ELEMENTS = {
    heading: { label: "Heading", group: "Text", size: [12, 3], blank: () => ({ text: "New heading", level: 2 }) },
    text: { label: "Text", group: "Text", size: [8, 5], blank: () => ({ text: "Write something here. **Bold**, *italic* and [links](https://example.com) work." }) },
    button: { label: "Button", group: "Text", size: [3, 2], blank: () => ({ label: "Click me", url: "/", variant: "solid" }) },
    image: { label: "Image", group: "Media", size: [6, 10], blank: () => ({ asset: "", alt: "", caption: "", fit: "cover", url: "" }) },
    gallery: { label: "Gallery", group: "Media", size: [12, 12], blank: () => ({ images: [], lightbox: true }) },
    slideshow: { label: "Slideshow", group: "Media", size: [12, 14], blank: () => ({ images: [], auto: 5 }) },
    embed: { label: "Music or video", group: "Media", size: [6, 8], blank: () => ({ url: "" }) },
    audio: { label: "Audio player", group: "Media", size: [6, 5], blank: () => ({ product: "", title: "" }) },
    releases: { label: "Releases", group: "Content", size: [12, 12], blank: () => ({ title: "Music", project: "", count: 4 }) },
    events: { label: "Events", group: "Content", size: [12, 10], blank: () => ({ title: "Upcoming", project: "", items: [] }) },
    tabs: { label: "Tabs", group: "Content", size: [12, 8], blank: () => ({ items: [{ title: "First", text: "Something to say." }, { title: "Second", text: "Something else." }] }) },
    accordion: { label: "FAQ / accordion", group: "Content", size: [12, 8], blank: () => ({ items: [{ title: "A question?", text: "Its answer." }] }) },
    countdown: { label: "Countdown", group: "Content", size: [6, 4], blank: () => ({ at: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 16), label: "Out in", done: "Out now" }) },
    socials: { label: "Social links", group: "Content", size: [12, 2], blank: () => ({ links: [] }) },
    products: { label: "Products", group: "Store", size: [12, 12], blank: () => ({ title: "", ids: [] }) },
    projects: { label: "Projects", group: "Store", size: [12, 8], blank: () => ({ title: "Projects" }) },
    follow: { label: "Follow button", group: "Store", size: [4, 2], blank: () => ({ project: "", label: "" }) },
    cart: { label: "Cart link", group: "Store", size: [3, 2], blank: () => ({ label: "" }) },
    divider: { label: "Divider", group: "Shapes", size: [12, 1], blank: () => ({}) },
    spacer: { label: "Box / spacer", group: "Shapes", size: [4, 4], blank: () => ({}) }
  };

  const el = (type, x, y, w, h, fields = {}) => ({ type, box: { x, y, w, h }, ...ELEMENTS[type].blank(), ...fields });
  // Section layouts for "Add section": each a list of elements already placed.
  const LAYOUTS = {
    blank: { label: "Blank", rows: 10, elements: () => [] },
    hero: { label: "Banner", rows: 18, full: true, elements: () => [el("heading", 0, 5, 9, 4, { text: "Big headline", level: 1 }), el("text", 0, 10, 7, 3, { text: "A line under it." }), el("button", 0, 14, 3, 2, { label: "Find out more" })] },
    two: { label: "Two columns", rows: 10, elements: () => [el("text", 0, 0, 6, 8), el("text", 6, 0, 6, 8)] },
    three: { label: "Three columns", rows: 10, elements: () => [el("text", 0, 0, 4, 8), el("text", 4, 0, 4, 8), el("text", 8, 0, 4, 8)] },
    media: { label: "Image and text", rows: 12, elements: () => [el("image", 0, 0, 6, 11), el("heading", 7, 1, 5, 3, { text: "A heading" }), el("text", 7, 5, 5, 5)] },
    store: { label: "Products", rows: 14, elements: () => [el("products", 0, 0, 12, 13, { title: "From the store" })] }
  };

  let counter = 0;
  const newId = (prefix) => `${prefix}${Date.now().toString(36).slice(-5)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 4)}`.slice(0, 16);

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const withIds = (elements) => elements.map((e) => ({ id: newId("e"), ...e }));

  function newSection(layout = "blank") {
    const l = LAYOUTS[layout] || LAYOUTS.blank;
    return { id: newId("s"), rows: l.rows, full: Boolean(l.full), cls: [], background: { color: "", asset: "", fit: "cover", overlay: 0, text: "" }, elements: withIds(l.elements()) };
  }

  // The lowest free spot for a w × h box in a section (the top row where it overlaps nothing), else below everything.
  function freeSpot(section, w, h) {
    const taken = (x, y) => section.elements.some((e) => x < e.box.x + e.box.w && x + w > e.box.x && y < e.box.y + e.box.h && y + h > e.box.y);
    for (let y = 0; y < 200; y++) for (let x = 0; x + w <= 12; x++) if (!taken(x, y)) return { x, y };
    return { x: 0, y: Math.max(0, ...section.elements.map((e) => e.box.y + e.box.h)) };
  }

  function newElement(type, section) {
    const def = ELEMENTS[type];
    const [w, h] = def.size;
    const spot = section ? freeSpot(section, w, h) : { x: 0, y: 0 };
    return { id: newId("e"), type, box: { x: spot.x, y: spot.y, w, h }, phone: { hidden: false, order: null, h: 0 }, cls: [], style: {}, effect: "", hover: "", ...def.blank() };
  }

  // Where an element or section lives: { page, section, index } for elements, { page, index } for sections.
  function findElement(doc, pageIndex, id) {
    const page = doc.pages[pageIndex];
    for (const [si, s] of page.sections.entries()) {
      const i = s.elements.findIndex((e) => e.id === id);
      if (i >= 0) return { section: s, sectionIndex: si, index: i, element: s.elements[i] };
    }
    return null;
  }
  const findSection = (doc, pageIndex, id) => {
    const i = doc.pages[pageIndex].sections.findIndex((s) => s.id === id);
    return i >= 0 ? { index: i, section: doc.pages[pageIndex].sections[i] } : null;
  };

  // A copy of an element (or a section with new ids for it and its elements).
  const duplicateElement = (e) => ({ ...clone(e), id: newId("e"), box: { ...e.box, y: e.box.y + e.box.h } });
  const duplicateSection = (s) => ({ ...clone(s), id: newId("s"), elements: s.elements.map((e) => ({ ...clone(e), id: newId("e") })) });

  // Whole-document snapshots; record() after each finished change, undo() and redo() return the document to show.
  function history(start, max = 100) {
    const past = [JSON.stringify(start)];
    let at = 0;
    return {
      record(doc) {
        const snap = JSON.stringify(doc);
        if (snap === past[at]) return false;
        past.splice(at + 1);
        past.push(snap);
        if (past.length > max) past.shift();
        at = past.length - 1;
        return true;
      },
      undo: () => (at > 0 ? JSON.parse(past[--at]) : null),
      redo: () => (at < past.length - 1 ? JSON.parse(past[++at]) : null),
      canUndo: () => at > 0,
      canRedo: () => at < past.length - 1
    };
  }

  // Path helpers for the side panel's inputs (data-path="pages.0.sections.1.elements.2.text").
  const getAt = (obj, path) => (path ? path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj) : obj);
  const setAt = (obj, path, value) => {
    const keys = path.split(".");
    const last = keys.pop();
    const parent = getAt(obj, keys.join("."));
    if (parent != null) parent[last] = value;
  };

  const api = { ELEMENTS, LAYOUTS, newId, newSection, newElement, freeSpot, findElement, findSection, duplicateElement, duplicateSection, history, getAt, setAt, clone };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.GS = root.GS || {}).builderModel = api;
})(typeof self !== "undefined" ? self : globalThis);

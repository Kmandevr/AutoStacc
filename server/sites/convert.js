// Version 1 site documents (the old form editor's: a list of blocks per page) as version 2: each page becomes one
// section with its blocks stacked in full-width rows, in order, so a converted site reads as it did. Fields pass
// through unchecked; sites/document.js checks the result like any document.
const HEIGHT = { heading: 3, text: 6, image: 14, gallery: 14, button: 2, embed: 14, events: 10, socials: 2, products: 12, divider: 1 };

export function fromVersion1(raw) {
  const pages = raw.pages;
  return {
    version: 2,
    theme: raw.theme,
    nav: { items: [] },
    pages: Array.isArray(pages) ? pages.map((p) => {
      if (!p || typeof p !== "object") return p;
      let y = 0;
      const blocks = Array.isArray(p.blocks) ? p.blocks : [];
      const elements = blocks.map((b, i) => {
        const h = HEIGHT[b && b.type] || 4;
        const el = { ...(b && typeof b === "object" ? b : {}), id: `e${i + 1}`, box: { x: 0, y, w: 12, h } };
        y += h + 1;
        return el;
      });
      return { slug: p.slug, title: p.title, sections: [{ id: "s1", rows: Math.max(y, 6), elements }] };
    }) : pages
  };
}

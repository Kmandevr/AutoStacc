// Kinds of product the store sells. A product's `type` (data/products.js) is one of these keys. Add a kind here and
// every part of the store (filters, labels, product pages, checkout, library) picks it up; nothing else changes.
// label: shown on tags and filters. maxQuantity: how many one order may hold (digital files: 1). preview: what kind of
// preview the product page offers when the product has one ("audio" plays it; "none" never shows a player).
// track: which AutoStacc track colour tags it (a key of data/content-types.js: midi amber, samples coral, loops lime,
// presets violet; "" = teal). Generated covers on platform pages use it. license: which licence in data/licenses.js
// covers it (shown on /license and on each product page); none for a kind without fixed terms.
window.PRODUCT_TYPES = {
  music: { label: "Music", maxQuantity: 1, preview: "audio", track: "midi", license: "music" },
  stems: { label: "Stems", maxQuantity: 1, preview: "audio", track: "loops", license: "stems" },
  samples: { label: "Samples", maxQuantity: 1, preview: "audio", track: "samples", license: "sounds" },
  "sample-pack": { label: "Sample Packs", maxQuantity: 1, preview: "audio", track: "samples", license: "sounds" },
  presets: { label: "Presets", maxQuantity: 1, preview: "audio", track: "presets", license: "sounds" },
  visuals: { label: "Visuals", maxQuantity: 1, preview: "none", track: "", license: "visuals" },
  "vj-loops": { label: "VJ Loops", maxQuantity: 1, preview: "none", track: "", license: "visuals" },
  // Site templates and sections sold in the Studio's community library (docs/builder.md): nothing to download; owning
  // one lets you install it into your own sites.
  template: { label: "Site templates", maxQuantity: 1, preview: "none", track: "", license: "templates" },
  other: { label: "Other", maxQuantity: 1, preview: "audio", track: "" }
};

// Kinds of product the store sells. A product's `type` (data/products.js) is one of these keys. Add a kind here and
// every part of the store (filters, labels, product pages, checkout, library) picks it up; nothing else changes.
// label: shown on tags and filters. maxQuantity: how many one order may hold (digital files: 1). preview: what kind of
// preview the product page offers when the product has one ("audio" plays it; "none" never shows a player).
// track: which AutoStacc track colour tags it (a key of data/content-types.js: midi amber, samples coral, loops lime,
// presets violet; "" = teal). Generated covers on platform pages use it.
window.PRODUCT_TYPES = {
  music: { label: "Music", maxQuantity: 1, preview: "audio", track: "midi" },
  stems: { label: "Stems", maxQuantity: 1, preview: "audio", track: "loops" },
  samples: { label: "Samples", maxQuantity: 1, preview: "audio", track: "samples" },
  "sample-pack": { label: "Sample Packs", maxQuantity: 1, preview: "audio", track: "samples" },
  presets: { label: "Presets", maxQuantity: 1, preview: "audio", track: "presets" },
  visuals: { label: "Visuals", maxQuantity: 1, preview: "none", track: "" },
  "vj-loops": { label: "VJ Loops", maxQuantity: 1, preview: "none", track: "" },
  other: { label: "Other", maxQuantity: 1, preview: "audio", track: "" }
};

// Kinds of product the store sells. A product's `type` (data/products.js) is one of these keys. Add a kind here and
// every part of the store (filters, labels, product pages, checkout, library) picks it up; nothing else changes.
// label: shown on tags and filters. maxQuantity: how many one order may hold (digital files: 1). preview: what kind of
// preview the product page offers when the product has one ("audio" plays it; "none" never shows a player).
window.PRODUCT_TYPES = {
  music: { label: "Music", maxQuantity: 1, preview: "audio" },
  stems: { label: "Stems", maxQuantity: 1, preview: "audio" },
  samples: { label: "Samples", maxQuantity: 1, preview: "audio" },
  "sample-pack": { label: "Sample Packs", maxQuantity: 1, preview: "audio" },
  presets: { label: "Presets", maxQuantity: 1, preview: "audio" },
  visuals: { label: "Visuals", maxQuantity: 1, preview: "none" },
  "vj-loops": { label: "VJ Loops", maxQuantity: 1, preview: "none" },
  other: { label: "Other", maxQuantity: 1, preview: "audio" }
};

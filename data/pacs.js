// Pacs: folders of actual content (MIDI, samples, loops, presets, stems, ...). Each belongs to one Stacclet (and so
// to its project) and is sold through a product that lists it in `pacs` (data/products.js). The files themselves are
// uploaded in /admin to that product and tagged with the Pac; they are the assets customers see in Your Stacc.
// Fields: id (lowercase-hyphenated, permanent), stacclet (an id in data/stacclets.js), title,
//   description (optional, plain text), draft: true = placeholder (a published product can't sell a draft Pac).
window.PACS = [
  { id: "frayed-signals-midi", stacclet: "frayed-signals", title: "MIDI Pac", draft: true },
  { id: "frayed-signals-samples", stacclet: "frayed-signals", title: "Samples Pac", draft: true },
  { id: "frayed-signals-loops", stacclet: "frayed-signals", title: "Loops Pac", draft: true },
  { id: "frayed-signals-presets", stacclet: "frayed-signals", title: "Presets Pac", draft: true }
];

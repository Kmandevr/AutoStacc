// Dev-only first-party store fixtures, seeded by scripts/dev.js into the local store (never into data/, the deploy or
// production): the six former placeholder products of data/products.js (removed by the owner, 2026-10-21; the real ones
// are made in the Studio), kept here in the data/products.js shape so the test suites keep their ids, prices and Pacs.
// Plus one test show; the release and news post the store tests use are the real ones the content migration seeds
// (scripts/dev.js replays it). Nothing here is a fact about the artist. An ES module
// (test/ is "type": "module"); scripts/dev.js loads it with require().
export const PRODUCTS = [
  {
    id: "sample-pack-vol1",
    title: "Frayed Signals — Sample Pack Vol. 1",
    project: "glitches-and-stitches",
    type: "sample-pack",
    price: 24.99,
    description: "300+ one-shots, glitch loops, bit-crushed vocal chops and stitched-together drum fills. WAV, 24-bit.",
    tags: ["wav", "one-shots", "loops"],
    facets: { style: ["glitch"], contents: ["one-shots", "loops", "vocals"], format: ["wav"] },
    specs: { bitDepth: 24 },
    pacs: ["frayed-signals-samples", "frayed-signals-loops"],
    hue: 300,
    featured: true,
    draft: true
  },
  {
    id: "serum-presets",
    title: "Seam Ripper — Serum Preset Bank",
    project: "glitches-and-stitches",
    type: "presets",
    price: 19.99,
    description: "64 Serum presets: tearing basses, stuttering leads and the signature wobble from the live sets.",
    tags: ["serum", "presets"],
    facets: { contents: ["presets"], plugin: ["serum"] },
    hue: 190,
    featured: true,
    draft: true
  },
  {
    id: "stems-patchwork",
    title: "Patchwork (Remix Stems)",
    project: "glitches-and-stitches",
    type: "stems",
    price: 9.99,
    description: "Full stem set for the single 'Patchwork'. Remix it, flip it, send it back to us.",
    tags: ["stems", "remix"],
    facets: { contents: ["stems"], use: ["remixing"] },
    hue: 40,
    featured: true,
    draft: true
  },
  {
    id: "ep-corrupted-thread",
    title: "Corrupted Thread EP (Lossless)",
    project: "glitches-and-stitches",
    type: "music",
    price: 7.00,
    description: "The 5-track EP in FLAC and WAV, plus 2 bonus tracks only available here.",
    tags: ["flac", "wav"],
    facets: { contents: ["tracks"], format: ["flac", "wav"] },
    hue: 330,
    featured: false,
    draft: true
  },
  {
    id: "wallpapers",
    title: "Static Bloom — Wallpaper Pack",
    project: "glitches-and-stitches",
    type: "visuals",
    price: 3.00,
    description: "12 phone and desktop wallpapers pulled from the live visuals.",
    tags: ["wallpapers"],
    facets: { contents: ["images"], use: ["wallpapers"] },
    hue: 260,
    featured: false,
    draft: true
  },
  {
    id: "vj-loops",
    title: "Live Set VJ Loops",
    project: "glitches-and-stitches",
    type: "vj-loops",
    price: 14.99,
    description: "20 seamless 4K glitch loops from the tour visuals, ready for Resolume.",
    tags: ["4k", "resolume"],
    facets: { style: ["glitch"], contents: ["video-loops"], plugin: ["resolume"] },
    metadata: { Resolution: "4K" },
    hue: 160,
    featured: false,
    draft: true
  }
];

// A published show far enough ahead to stay "upcoming" (a test date, not a real one).
export const SHOWS = [
  { id: "shw_devtestshow", project: "glitches-and-stitches", date: "2099-06-01", city: "Test City", venue: "Dev Test Venue", ticketUrl: "https://tickets.example.org/dev" }
];

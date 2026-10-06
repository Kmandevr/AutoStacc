// Digital items for sale.
// `checkoutUrl` is where the Buy button sends people: a Stripe Payment Link,
// Gumroad, Lemon Squeezy, Bandcamp, etc. Those services take the payment and
// deliver the download, so this site never handles card details or files.
// Leave `checkoutUrl` empty to show the item as "Coming soon".
window.PRODUCTS = [
  {
    id: "sample-pack-vol1",
    title: "Frayed Signals — Sample Pack Vol. 1",
    category: "Sample Packs",
    price: 24.99,
    description: "300+ one-shots, glitch loops, bit-crushed vocal chops and stitched-together drum fills. WAV, 24-bit.",
    hue: 300,
    featured: true,
    checkoutUrl: ""
  },
  {
    id: "serum-presets",
    title: "Seam Ripper — Serum Preset Bank",
    category: "Presets",
    price: 19.99,
    description: "64 Serum presets: tearing basses, stuttering leads and the signature wobble from the live sets.",
    hue: 190,
    featured: true,
    checkoutUrl: ""
  },
  {
    id: "stems-patchwork",
    title: "Patchwork (Remix Stems)",
    category: "Stems",
    price: 9.99,
    description: "Full stem set for the single 'Patchwork'. Remix it, flip it, send it back to us.",
    hue: 40,
    featured: true,
    checkoutUrl: ""
  },
  {
    id: "ep-corrupted-thread",
    title: "Corrupted Thread EP (Lossless)",
    category: "Music",
    price: 7.00,
    description: "The 5-track EP in FLAC and WAV, plus 2 bonus tracks only available here.",
    hue: 330,
    featured: false,
    checkoutUrl: ""
  },
  {
    id: "wallpapers",
    title: "Static Bloom — Wallpaper Pack",
    category: "Visuals",
    price: 3.00,
    description: "12 phone and desktop wallpapers pulled from the live visuals.",
    hue: 260,
    featured: false,
    checkoutUrl: ""
  },
  {
    id: "vj-loops",
    title: "Live Set VJ Loops",
    category: "Visuals",
    price: 14.99,
    description: "20 seamless 4K glitch loops from the tour visuals, ready for Resolume.",
    hue: 160,
    featured: false,
    checkoutUrl: ""
  }
];

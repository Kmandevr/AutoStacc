// The platform: AutoStacc's identity and site-wide settings. The one source for the site header, footer, platform
// page metadata, structured data (WebSite, Organization) and sitemap. Each project's own identity (name, bio,
// profiles, contact) is in data/projects.js. After editing anything in data/, run `node scripts/build.js`.
// Vocabulary and look: docs/autostacc.md.
window.SITE = {
  name: "AutoStacc",
  // The live address. Canonical links, the sitemap and link previews are built from it.
  url: "https://autostacc.com",
  // The home page's title and description (search results and link previews). Other pages write their own.
  title: "AutoStacc — Samples, presets, stems and music, organized for you",
  description: "AutoStacc sells and delivers sample packs, presets, stems, music and visuals from the projects that make them, and keeps everything you own sorted in Your Stacc.",
  tagline: "Stacc it once. Auto handles the rest.",
  // Link-preview picture for pages without their own artwork, and the organization's logo in structured data.
  image: { src: "img/og.png", width: 1200, height: 630, alt: "The AutoStacc logo, four stacked colour blocks, beside the AutoStacc wordmark" },
  logo: "img/apple-touch-icon.png",
  // Currency of the prices in data/products.js.
  currency: "USD",
  // Platform support contact (footer). Empty hides it; never put a made-up address here.
  email: ""
};

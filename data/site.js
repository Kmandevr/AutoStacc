// Site-wide settings and the artist's identity: the one source for the header, footer, press page, page metadata,
// structured data and sitemap. After editing anything in data/, run `node scripts/build.js` to regenerate the
// page heads, the release/product/news pages and sitemap.xml.
window.SITE = {
  // The platform the site runs on. Projects (data/projects.js) create the content; AutoStacc sells, delivers and
  // organizes it. Shown in product credits, the footer and /projects. Vocabulary: docs/autostacc.md.
  platform: { name: "AutoStacc", tagline: "Stacc it once. Auto handles the rest." },
  // The home project's name: the site-wide header, page titles and structured data still use it (docs/decisions.md).
  artist: "Glitches & Stitches",
  // Other ways people type the name. Only tells search engines it's the same site (WebSite alternateName); never shown.
  alternateNames: ["Glitches and Stitches"],
  // The live address. Canonical links, the sitemap and link previews are built from it.
  url: "https://autostacc.com",
  // The home page's title and description (search results and link previews). Other pages write their own.
  title: "Glitches & Stitches — Official Site",
  description: "Official site of Glitches & Stitches: experimental electronic music built from broken pieces. Releases, stems, sample packs and presets.",
  // One-line description of the artist (structured data). Written from docs/identity.md; no invented facts.
  bio: "Glitches & Stitches is an electronic music project that treats unfinished songs as raw material: fragments are torn out, stitched into new tracks and glitched into something new.",
  tagline: "Tear. Stitch. Glitch. Cinch. Repeat.",
  genres: ["Electronic", "EDM"],
  // Link-preview picture for pages without their own artwork, and the artist image in structured data.
  image: { src: "img/og.png", width: 1200, height: 630, alt: "Glitches & Stitches in green pixel type on a black terminal screen" },
  logo: "img/apple-touch-icon.png",
  // Currency of the prices in data/products.js.
  currency: "USD",
  // Booking and press contact (footer and press page). Empty hides it; never put a made-up address here.
  email: "",
  // Link to a downloadable press kit (zip or folder of photos, logo, bio). Empty hides the button.
  pressKitUrl: "",
  // Newsletter form posts here (e.g. a Buttondown, Mailchimp or Formspree endpoint).
  // Leave empty to show a "coming soon" message instead of submitting.
  newsletterAction: "",
  // Official artist profiles: the one list behind the footer, the press page, the music page and search engines (sameAs).
  // Only the artist's own profile pages. Leave `url` empty until the real profile exists; never a site's home page.
  socials: [
    { name: "Apple Music", url: "https://music.apple.com/us/artist/glitches-stiches/1847091236" },
    { name: "Deezer", url: "https://www.deezer.com/artist/354234772" },
    { name: "Spotify", url: "" },
    { name: "YouTube", url: "" },
    { name: "SoundCloud", url: "" },
    { name: "Bandcamp", url: "" },
    { name: "Instagram", url: "" },
    { name: "TikTok", url: "" }
  ]
};

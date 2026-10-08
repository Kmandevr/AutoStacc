// Projects: the creative work on AutoStacc, each owned by a creator (data/creators.js). Everything a project publishes
// names it with `project: "<id>"` (products, releases, news posts, Stacclets, polls), so adding a project is data, not
// code. A project lives at /<creator>/<id> (hand-written pages <creator>/<id>.html and <creator>/<id>/); it is synced
// into the store database by db/catalog.sql (`node scripts/build.js`). Projects made in the Studio are database-only.
// Model: docs/architecture.md; contract: docs/projects.md.
// Fields:
//   id: lowercase-hyphenated, permanent, unique (store-wide for these first-party projects; within its creator, ignoring
//     case, for Studio projects). name: as the project writes it (shown as "by <name>").
//   creator: id of the creator that owns it (data/creators.js).
//   summary: one plain-text line for the directory and dashboard, confirmed facts only.
//   title, description: the project home page's search title and description.
//   features: the platform features it uses: "releases", "news", "shows", "store", "polls", "relationships".
//     Polls and relationships are refused by the build for projects that don't list them.
//   pages: its own pages, the nav of its own header: [{ label, path }], path relative to /projects/<id>
//     ("" = its home, "music", "#shows"). wordmark: optional lettering for its header logo (else its name).
//     Its pages wear its own header and footer (js/project-frame.js) under a thin AutoStacc strip.
//   skin: true = its pages, header and footer load css/projects/<id>/skin.css (its own look). sounds: true = its pages load the UI sounds
//     and easter eggs (js/sound.js, eggs.js, terminal.js). Platform pages never play sounds.
//   entity: schema.org type for structured data ("MusicGroup", "Person", "Organization").
//   bio, tagline, genres, alternateNames (search only, never shown), image { src, width, height, alt }, logo,
//   email (booking/press; empty hides it, never a made-up address), pressKitUrl, newsletterAction (form endpoint;
//   empty shows "coming soon"), socials: [{ name, url }] official profiles only (empty url = not set yet; never a
//   site's home page).
//   logoFull: optional { src, width, height } of its full logo, the heading of its project card.
//   draft: true keeps it off /projects and out of the store database.
window.PROJECTS = [
  {
    id: "glitches-and-stitches",
    name: "Glitches & Stitches",
    creator: "autostacc",
    wordmark: "GLITCHES&STITCHES",
    summary: "An electronic music project that treats unfinished songs as raw material: fragments are torn out, stitched into new tracks and glitched into something new.",
    title: "Glitches & Stitches — Experimental electronic music · AutoStacc",
    description: "Glitches & Stitches on AutoStacc: experimental electronic music built from broken pieces. Releases, news and press.",
    features: ["releases", "news", "shows", "store", "polls", "relationships"],
    pages: [
      { label: "Home", path: "" },
      { label: "Music", path: "music" },
      { label: "Shows", path: "#shows" },
      { label: "News", path: "news" },
      { label: "Press", path: "press" }
    ],
    skin: true,
    sounds: true,
    entity: "MusicGroup",
    // Written from docs/identity.md; no invented facts.
    bio: "Glitches & Stitches is an electronic music project that treats unfinished songs as raw material: fragments are torn out, stitched into new tracks and glitched into something new.",
    tagline: "Tear. Stitch. Glitch. Cinch. Repeat.",
    genres: ["Electronic", "EDM"],
    alternateNames: ["Glitches and Stitches"],
    image: { src: "img/projects/glitches-and-stitches/og.png", width: 1200, height: 630, alt: "The Glitches & Stitches logo: Glitches over Stitches in green pixel type, a purple thread through the ampersand, framed by a line that sweeps up to the right" },
    logo: "img/projects/glitches-and-stitches/icon.png",
    logoFull: { src: "img/projects/glitches-and-stitches/logo.png", width: 1600, height: 760 },
    email: "",
    pressKitUrl: "",
    newsletterAction: "",
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
  }
];

// Starter templates for the visual builder (owner, 2026-10-15; docs/builder.md): Artist / Producer, DJ / Live,
// Sample-pack brand, Label / Collective. Each is a version 2 site document with placeholder words for the creator to
// replace (never facts about anyone) and no images, so it costs no storage; the editor offers them when a site starts
// and replaces the draft with the one picked. Checked like any document (test/unit/builder.test.js).
let n = 0;
const id = () => `t${++n}`;
const box = (x, y, w, h) => ({ x, y, w, h });
const el = (type, b, fields = {}, extra = {}) => ({ id: id(), type, box: b, ...fields, ...extra });
const heading = (text, b, level = 2, extra) => el("heading", b, { text, level }, extra);
const text = (t, b, extra) => el("text", b, { text: t }, extra);
const button = (label, url, b, variant = "solid") => el("button", b, { label, url, variant });
const section = (rows, elements, extra = {}) => ({ id: id(), rows, elements, ...extra });
const page = (slug, title, sections) => ({ slug, title, sections });
const card = { style: { bg: "", pad: 24, radius: 16 } };

const ABOUT = (who) => page("about", "About", [
  section(16, [
    heading("About", box(0, 1, 12, 3), 1),
    text(`Tell people who ${who} and what drives the work. A few short paragraphs read best.\n\nAdd where you're based, what you're working on now and how to get in touch.`, box(0, 5, 8, 8)),
    el("socials", box(0, 13, 12, 2), { links: [] })
  ])
]);

const artist = {
  id: "artist", label: "Artist / Producer", blurb: "A big name banner, your latest release, shows and links.",
  doc: { version: 2, theme: { preset: "neon", accent: "#ff3d81", font: "syne", header: "bar" }, nav: { items: [] }, pages: [
    page("", "Home", [
      section(20, [
        heading("Your artist name", box(0, 5, 9, 4), 1, { style: { size: "xxl" }, effect: "rise" }),
        text("One line about your sound. Make it yours.", box(0, 10, 7, 3), { effect: "fade" }),
        button("Listen now", "/discover/explore", box(0, 14, 3, 2))
      ], { full: true, background: { color: "#14112a" } }),
      section(14, [
        heading("Latest release", box(0, 1, 12, 3)),
        text("Add a Music element with a Spotify, SoundCloud, YouTube or Apple Music share link, or show your products from the AutoStacc store.", box(0, 5, 7, 6), card),
        el("products", box(7, 5, 5, 8), { title: "", ids: [] })
      ]),
      section(12, [el("events", box(0, 1, 12, 10), { title: "Shows", items: [] })])
    ]),
    ABOUT("you are")
  ] }
};

const dj = {
  id: "dj", label: "DJ / Live", blurb: "Upcoming dates up front, mixes and a booking link.",
  doc: { version: 2, theme: { preset: "midnight", accent: "#22d3ee", font: "display", header: "bar" }, nav: { items: [] }, pages: [
    page("", "Home", [
      section(18, [
        heading("YOUR DJ NAME", box(0, 4, 12, 5), 1, { style: { size: "xxl", align: "center" }, effect: "zoom" }),
        text("Genres you play · where you play them", box(2, 10, 8, 2), { style: { align: "center" } }),
        button("Booking", "mailto:booking@example.com", box(5, 13, 2, 2))
      ], { full: true, background: { color: "#0b1d26" } }),
      section(14, [el("events", box(0, 1, 12, 12), { title: "Upcoming dates", items: [] })]),
      section(12, [
        heading("Mixes", box(0, 1, 12, 3)),
        text("Add Music elements with your SoundCloud, Mixcloud or YouTube sets.", box(0, 5, 12, 3), card)
      ])
    ]),
    ABOUT("you are as a DJ")
  ] }
};

const packs = {
  id: "packs", label: "Sample-pack brand", blurb: "Store-forward: featured packs, what's inside and previews.",
  doc: { version: 2, theme: { preset: "concrete", accent: "#ff5a1f", font: "grotesk", header: "bar" }, nav: { items: [] }, pages: [
    page("", "Home", [
      section(16, [
        heading("Your brand name", box(0, 3, 7, 4), 1, { style: { size: "xxl" } }),
        text("Sounds made for producers. Say what makes your packs different.", box(0, 8, 6, 3)),
        button("Shop the packs", "/shop", box(0, 12, 3, 2)),
        el("spacer", box(7, 2, 5, 12), {}, { style: { bg: "#ff5a1f", radius: 24 } })
      ]),
      section(14, [el("products", box(0, 1, 12, 12), { title: "Featured packs", ids: [] })]),
      section(10, [
        heading("Hear it first", box(0, 1, 12, 3)),
        text("Add an Audio player for a product's preview clip, or a Music element.", box(0, 5, 12, 3), card)
      ]),
      section(10, [el("accordion", box(0, 1, 12, 8), { items: [
        { title: "What formats do the packs come in?", text: "Say which file types and sample rates you deliver." },
        { title: "Can I use the sounds in released music?", text: "Every purchase comes with AutoStacc's licence for its kind of product." }
      ] })])
    ]),
    ABOUT("is behind the brand")
  ] }
};

const label = {
  id: "label", label: "Label / Collective", blurb: "Your roster of projects, releases and news.",
  doc: { version: 2, theme: { preset: "paper", accent: "#111111", font: "serif", header: "bar" }, nav: { items: [] }, pages: [
    page("", "Home", [
      section(16, [
        heading("Label name", box(0, 4, 12, 4), 1, { style: { size: "xxl", align: "center" } }),
        text("What the label stands for, in a sentence.", box(2, 9, 8, 3), { style: { align: "center" } })
      ], { full: true, background: { color: "#ece8df" } }),
      section(12, [el("projects", box(0, 1, 12, 10), { title: "Roster" })]),
      section(12, [el("products", box(0, 1, 12, 10), { title: "Releases", ids: [] })]),
      section(10, [
        heading("News", box(0, 1, 12, 3)),
        el("tabs", box(0, 5, 12, 5), { items: [{ title: "Latest", text: "Share what's new." }, { title: "Coming up", text: "Tease what's next." }] })
      ])
    ]),
    ABOUT("the label is")
  ] }
};

export const TEMPLATES = [artist, dj, packs, label];
export const templateById = (key) => TEMPLATES.find((t) => t.id === key) || null;

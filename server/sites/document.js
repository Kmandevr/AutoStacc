// The Studio's site document: what a creator edits, saved as a draft and rendered at publish. This is the only shape
// accepted; anything else is dropped or refused with a 400 naming the place. Pure: references to images and products
// are returned for the caller to check against the database (they must be the creator's own).
//   { theme: { preset, accent, font }, pages: [{ slug, title, blocks: [block] }] }
// The first page is the home (slug ""), served at /<creator>/<project>; the others at /<creator>/<project>/<slug>.
import { fail } from "../lib/http.js";
import { LIMITS } from "../creators/policy.js";
import { PRESETS, FONTS, DEFAULT_THEME, HEX } from "./theme.js";
import { safeUrl } from "./text.js";
import { embedFor } from "./embeds.js";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET = /^as_[a-z2-7]{20,40}$/;
const PRODUCT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const NETWORKS = ["Website", "Spotify", "Apple Music", "SoundCloud", "Bandcamp", "YouTube", "Instagram", "TikTok", "X", "Facebook", "Twitch", "Mixcloud"];

const bad = (where, what) => fail(400, "invalid_site", `${where}: ${what}`, { where });
const text = (v, where, max, { required = false } = {}) => {
  if (v === undefined || v === null || v === "") {
    if (required) bad(where, "required");
    return "";
  }
  if (typeof v !== "string") bad(where, "must be text");
  const s = v.replace(/\r\n?/g, "\n").trim();
  if (s.length > max) bad(where, `at most ${max} characters`);
  return s;
};
const url = (v, where, { required = true } = {}) => {
  if (!v && !required) return "";
  const u = safeUrl(v);
  if (!u) bad(where, "use a full https:// link, a mailto: address or an AutoStacc address starting with /");
  return u;
};
const list = (v, where, max) => {
  if (v === undefined) return [];
  if (!Array.isArray(v)) bad(where, "must be a list");
  if (v.length > max) bad(where, `at most ${max} items`);
  return v;
};
const asset = (v, where) => {
  if (typeof v !== "string" || !ASSET.test(v)) bad(where, "pick an uploaded image");
  return v;
};

// Each block type: its fields, cleaned. Unknown fields are dropped.
const BLOCKS = {
  heading: (b, w) => ({ text: text(b.text, `${w}.text`, 120, { required: true }), level: b.level === 3 ? 3 : 2 }),
  text: (b, w) => ({ text: text(b.text, `${w}.text`, 5000, { required: true }) }),
  image: (b, w) => ({ asset: asset(b.asset, `${w}.asset`), alt: text(b.alt, `${w}.alt`, 200), caption: text(b.caption, `${w}.caption`, 200) }),
  gallery: (b, w) => ({ images: list(b.images, `${w}.images`, 12).map((x, i) => ({ asset: asset(x && x.asset, `${w}.images[${i}]`), alt: text(x && x.alt, `${w}.images[${i}].alt`, 200) })) }),
  button: (b, w) => ({ label: text(b.label, `${w}.label`, 60, { required: true }), url: url(b.url, `${w}.url`) }),
  embed: (b, w) => {
    const raw = text(b.url, `${w}.url`, 500, { required: true });
    if (!embedFor(raw)) bad(`${w}.url`, "paste a share link from YouTube, Spotify, SoundCloud or Apple Music");
    return { url: raw };
  },
  events: (b, w) => ({
    title: text(b.title, `${w}.title`, 120),
    items: list(b.items, `${w}.items`, 50).map((x, i) => {
      const at = `${w}.items[${i}]`;
      if (!x || typeof x !== "object") bad(at, "must be an event");
      if (typeof x.date !== "string" || !DATE.test(x.date) || Number.isNaN(Date.parse(x.date))) bad(`${at}.date`, "use YYYY-MM-DD");
      return { date: x.date, title: text(x.title, `${at}.title`, 120, { required: true }), venue: text(x.venue, `${at}.venue`, 120),
        city: text(x.city, `${at}.city`, 80), url: url(x.url, `${at}.url`, { required: false }) };
    })
  }),
  socials: (b, w) => ({
    links: list(b.links, `${w}.links`, 12).map((x, i) => {
      const at = `${w}.links[${i}]`;
      if (!x || !NETWORKS.includes(x.network)) bad(`${at}.network`, "pick a network from the list");
      const u = url(x.url, `${at}.url`);
      if (!u.startsWith("https://")) bad(`${at}.url`, "use the full https:// address of the profile");
      return { network: x.network, url: u };
    })
  }),
  products: (b, w) => ({
    title: text(b.title, `${w}.title`, 120),
    ids: list(b.ids, `${w}.ids`, 12).map((x, i) => {
      if (typeof x !== "string" || !PRODUCT.test(x) || x.length > 80) bad(`${w}.ids[${i}]`, "unknown product");
      return x;
    })
  }),
  divider: () => ({})
};
export const BLOCK_TYPES = Object.keys(BLOCKS);

function theme(t) {
  const x = t && typeof t === "object" ? t : {};
  return {
    preset: PRESETS[x.preset] ? x.preset : DEFAULT_THEME.preset,
    accent: typeof x.accent === "string" && HEX.test(x.accent) ? x.accent.toLowerCase() : DEFAULT_THEME.accent,
    font: FONTS[x.font] ? x.font : DEFAULT_THEME.font
  };
}

// A new project's site: one home page with its name.
export const starterDocument = (projectName) => ({ theme: { ...DEFAULT_THEME }, pages: [{ slug: "", title: "Home", blocks: [{ type: "heading", text: projectName, level: 2 }] }] });

// Clean document plus what it refers to: { doc, assets: Set, products: Set }.
export function cleanDocument(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("site", "must be an object");
  if (JSON.stringify(raw).length > LIMITS.siteDocumentBytes) fail(413, "too_large", "This site is too big to save. Split long text across pages.");
  const pages = list(raw.pages, "pages", LIMITS.pagesPerSite);
  if (!pages.length) bad("pages", "add at least one page");
  const assets = new Set();
  const products = new Set();
  const seen = new Set();
  const doc = {
    theme: theme(raw.theme),
    pages: pages.map((p, i) => {
      const w = `pages[${i}]`;
      if (!p || typeof p !== "object") bad(w, "must be a page");
      const slug = i === 0 ? "" : text(p.slug, `${w}.slug`, 40, { required: true }).toLowerCase();
      if (i > 0 && (!SLUG.test(slug) || slug === "home")) bad(`${w}.slug`, "use lowercase letters, numbers and hyphens (not \"home\": that's the first page)");
      if (seen.has(slug)) bad(`${w}.slug`, "two pages have this address");
      seen.add(slug);
      const blocks = list(p.blocks, `${w}.blocks`, LIMITS.blocksPerPage).map((b, j) => {
        const at = `${w}.blocks[${j}]`;
        if (!b || typeof b !== "object" || !BLOCKS[b.type]) bad(`${at}.type`, `must be one of ${BLOCK_TYPES.join(", ")}`);
        const clean = { type: b.type, ...BLOCKS[b.type](b, at) };
        if (clean.asset) assets.add(clean.asset);
        (clean.images || []).forEach((x) => assets.add(x.asset));
        (clean.ids || []).forEach((x) => products.add(x));
        return clean;
      });
      return { slug, title: text(p.title, `${w}.title`, 60, { required: true }), blocks };
    })
  };
  return { doc, assets, products };
}

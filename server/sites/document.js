// The Studio's site document (docs/builder.md): what a creator edits, saved as a draft and rendered at publish, for a
// project's site and for a creator's profile. This is the only shape accepted; unknown fields are dropped and anything
// else is refused with a 400 naming the place. Version 1 documents (a list of blocks per page, the old form editor's)
// convert to version 2 on the way in, so existing sites keep working. Pure: references to images, products and
// projects are returned for the caller to check against the database (they must be the creator's own).
//   { version: 2, theme: { preset, accent, font, fontAsset, logo, header, css }, nav: { items: [{ label, page | url }] },
//     pages: [{ slug, title, description, sections: [{ id, rows, full, cls, background, elements: [element] }] }] }
// The first page is the home (slug ""), served at the site's address; the others at <address>/<slug>.
import { fail } from "../lib/http.js";
import { LIMITS } from "../creators/policy.js";
import { PRESETS, FONTS, HEADERS, DEFAULT_THEME, HEX } from "./theme.js";
import { safeUrl } from "./text.js";
import { checkCss, cleanClasses } from "./css.js";
import { fromVersion1 } from "./convert.js";
import { ELEMENTS, ELEMENT_TYPES, EFFECTS, HOVERS } from "./elements.js";
import { bad, text, list } from "./fields.js";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET = /^as_[a-z2-7]{20,40}$/;
const ID = /^[a-z0-9]{1,16}$/;
const int = (v, min, max, dflt) => (Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : dflt);
const hex = (v) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : "");
const optAsset = (v, where) => {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v !== "string" || !ASSET.test(v)) bad(where, "pick an uploaded file");
  return v;
};

function theme(t, refs) {
  const x = t && typeof t === "object" ? t : {};
  const css = text(x.css, "theme.css", LIMITS.cssBytes);
  const checked = checkCss(css);
  if (checked.problems.length) bad("theme.css", checked.problems[0]);
  checked.assets.forEach((a) => refs.assets.add(a));
  const out = {
    preset: PRESETS[x.preset] ? x.preset : DEFAULT_THEME.preset,
    accent: HEX.test(x.accent || "") ? x.accent.toLowerCase() : DEFAULT_THEME.accent,
    font: FONTS[x.font] ? x.font : DEFAULT_THEME.font,
    fontAsset: optAsset(x.fontAsset, "theme.fontAsset"),
    logo: optAsset(x.logo, "theme.logo"),
    header: HEADERS[x.header] ? x.header : DEFAULT_THEME.header,
    css
  };
  if (out.fontAsset) refs.fonts.add(out.fontAsset);
  if (out.logo) refs.assets.add(out.logo);
  return out;
}

function element(e, where, refs, ids) {
  if (!e || typeof e !== "object" || !ELEMENTS[e.type]) bad(`${where}.type`, `must be one of ${ELEMENT_TYPES.join(", ")}`);
  const id = typeof e.id === "string" && ID.test(e.id) && !ids.has(e.id) ? e.id : `e${ids.size + 1}x${Math.random().toString(36).slice(2, 6)}`;
  ids.add(id);
  const b = e.box && typeof e.box === "object" ? e.box : {};
  const w = int(b.w, 1, 12, 12);
  const box = { x: Math.min(int(b.x, 0, 11, 0), 12 - w), y: int(b.y, 0, LIMITS.gridRows - 1, 0), w, h: int(b.h, 1, 100, 4) };
  const p = e.phone && typeof e.phone === "object" ? e.phone : {};
  const s = e.style && typeof e.style === "object" ? e.style : {};
  return {
    id, type: e.type, box,
    phone: { hidden: p.hidden === true, order: Number.isInteger(p.order) ? int(p.order, 0, 999, 0) : null, h: int(p.h, 0, 100, 0) },
    cls: cleanClasses(e.cls),
    style: { align: ["left", "center", "right"].includes(s.align) ? s.align : "", color: hex(s.color), bg: hex(s.bg), radius: int(s.radius, 0, 64, 0),
      pad: int(s.pad, 0, 96, 0), size: ["s", "l", "xl", "xxl"].includes(s.size) ? s.size : "", shadow: s.shadow === true },
    effect: EFFECTS.includes(e.effect) ? e.effect : "",
    hover: HOVERS.includes(e.hover) ? e.hover : "",
    ...ELEMENTS[e.type](e, where, refs)
  };
}

function section(s, where, refs, ids, count) {
  if (!s || typeof s !== "object") bad(where, "must be a section");
  const bgIn = s.background && typeof s.background === "object" ? s.background : {};
  const background = { color: hex(bgIn.color), asset: optAsset(bgIn.asset, `${where}.background.asset`), fit: ["contain", "tile"].includes(bgIn.fit) ? bgIn.fit : "cover",
    overlay: int(bgIn.overlay, 0, 90, 0), text: hex(bgIn.text) };
  if (background.asset) refs.assets.add(background.asset);
  const elements = list(s.elements, `${where}.elements`, LIMITS.elementsPerPage).map((e, j) => element(e, `${where}.elements[${j}]`, refs, ids));
  count.n += elements.length;
  if (count.n > LIMITS.elementsPerPage) bad(where, `a page can hold at most ${LIMITS.elementsPerPage} elements`);
  const id = typeof s.id === "string" && ID.test(s.id) && !ids.has(s.id) ? s.id : `s${ids.size + 1}x${Math.random().toString(36).slice(2, 6)}`;
  ids.add(id);
  return { id, rows: int(s.rows, 1, LIMITS.gridRows, 12), full: s.full === true, cls: cleanClasses(s.cls), background, elements };
}

function nav(n, slugs) {
  const items = list(n && n.items, "nav.items", 12).map((x, i) => {
    const at = `nav.items[${i}]`;
    if (!x || typeof x !== "object") bad(at, "must be a menu item");
    const label = text(x.label, `${at}.label`, 40, { required: true });
    if (x.url) {
      const url = safeUrl(x.url);
      if (!url) bad(`${at}.url`, "use a full https:// link or an AutoStacc address starting with /");
      return { label, url };
    }
    const page = typeof x.page === "string" ? x.page.toLowerCase() : "";
    if (!slugs.has(page)) bad(`${at}.page`, "pick one of this site's pages");
    return { label, page };
  });
  return { items };
}

// A new site's document: one page, one section, a heading (and, on a profile, the creator's projects).
export function starterDocument(name, { profile = false } = {}) {
  const elements = [{ id: "e1", type: "heading", text: name, level: 1, box: { x: 0, y: 0, w: 12, h: 3 } }];
  if (profile) elements.push({ id: "e2", type: "projects", title: "Projects", box: { x: 0, y: 4, w: 12, h: 8 } });
  return cleanDocument({ version: 2, theme: { ...DEFAULT_THEME }, nav: { items: [] }, pages: [{ slug: "", title: "Home", sections: [{ id: "s1", rows: 12, elements }] }] }).doc;
}

// Clean document plus what it refers to: { doc, assets, fonts, products, projects } (Sets of ids).
export function cleanDocument(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) bad("site", "must be an object");
  if (JSON.stringify(input).length > LIMITS.siteDocumentBytes) fail(413, "too_large", "This site is too big to save. Split long text across pages.");
  const raw = input.version === 2 ? input : fromVersion1(input);
  const refs = { assets: new Set(), fonts: new Set(), products: new Set(), projects: new Set() };
  const pages = list(raw.pages, "pages", LIMITS.pagesPerSite);
  if (!pages.length) bad("pages", "add at least one page");
  const seen = new Set();
  const doc = { version: 2, theme: theme(raw.theme, refs), nav: { items: [] }, pages: pages.map((p, i) => {
    const w = `pages[${i}]`;
    if (!p || typeof p !== "object") bad(w, "must be a page");
    const slug = i === 0 ? "" : text(p.slug, `${w}.slug`, 40, { required: true }).toLowerCase();
    if (i > 0 && (!SLUG.test(slug) || slug === "home")) bad(`${w}.slug`, "use lowercase letters, numbers and hyphens (not \"home\": that's the first page)");
    // A project's /community address belongs to its community space (docs/community.md), never to a page.
    if (slug === "community") bad(`${w}.slug`, "\"community\" is kept for the project's community space; pick another address");
    if (seen.has(slug)) bad(`${w}.slug`, "two pages have this address");
    seen.add(slug);
    const ids = new Set();
    const count = { n: 0 };
    const sections = list(p.sections, `${w}.sections`, LIMITS.sectionsPerPage).map((s, j) => section(s, `${w}.sections[${j}]`, refs, ids, count));
    return { slug, title: text(p.title, `${w}.title`, 60, { required: true }), description: text(p.description, `${w}.description`, 160), sections };
  }) };
  doc.nav = nav(raw.nav, seen);
  return { doc, ...refs };
}

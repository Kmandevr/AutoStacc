// The elements a creator can place on a site (docs/builder.md) and each one's own fields, cleaned; unknown fields are
// dropped. How they look is js/site-elements.js. refs collects what an element shows that must be the creator's own:
// images (assets), products and projects.
import { NETWORKS } from "./networks.js";
import { embedFor } from "./embeds.js";
import { bad, text, url, list } from "./fields.js";

const ASSET = /^as_[a-z2-7]{20,40}$/;
const PRODUCT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WHEN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const EFFECTS = ["fade", "rise", "zoom", "slide-left", "slide-right"];
export const HOVERS = ["lift", "glow", "grow"];

const asset = (v, where, refs) => {
  if (typeof v !== "string" || !ASSET.test(v)) bad(where, "pick an uploaded image");
  refs.assets.add(v);
  return v;
};
const product = (v, where, refs) => {
  if (typeof v !== "string" || !PRODUCT.test(v) || v.length > 80) bad(where, "pick one of your products");
  refs.products.add(v);
  return v;
};
const project = (v, where, refs) => {
  if (typeof v !== "string" || !PROJECT.test(v)) bad(where, "pick one of your projects");
  refs.projects.add(v);
  return v;
};
const pictures = (v, where, refs, max, captions) => list(v, where, max).map((x, i) => ({
  asset: asset(x && x.asset, `${where}[${i}]`, refs), alt: text(x && x.alt, `${where}[${i}].alt`, 200),
  ...(captions ? { caption: text(x && x.caption, `${where}[${i}].caption`, 200) } : {})
}));
const panels = (v, where) => list(v, where, 12).map((x, i) => ({
  title: text(x && x.title, `${where}[${i}].title`, 80, { required: true }), text: text(x && x.text, `${where}[${i}].text`, 3000)
}));

export const ELEMENTS = {
  heading: (b, w) => ({ text: text(b.text, `${w}.text`, 120, { required: true }), level: [1, 2, 3].includes(b.level) ? b.level : 2 }),
  text: (b, w) => ({ text: text(b.text, `${w}.text`, 5000, { required: true }) }),
  image: (b, w, refs) => ({ asset: asset(b.asset, `${w}.asset`, refs), alt: text(b.alt, `${w}.alt`, 200), caption: text(b.caption, `${w}.caption`, 200),
    fit: b.fit === "contain" ? "contain" : "cover", url: url(b.url, `${w}.url`, { required: false }) }),
  gallery: (b, w, refs) => ({ images: pictures(b.images, `${w}.images`, refs, 24), lightbox: b.lightbox === true }),
  slideshow: (b, w, refs) => ({ images: pictures(b.images, `${w}.images`, refs, 20, true), auto: Number.isInteger(b.auto) ? Math.min(20, Math.max(0, b.auto)) : 0 }),
  button: (b, w) => ({ label: text(b.label, `${w}.label`, 60, { required: true }), url: url(b.url, `${w}.url`), variant: b.variant === "outline" ? "outline" : "solid" }),
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
  products: (b, w, refs) => ({ title: text(b.title, `${w}.title`, 120), ids: list(b.ids, `${w}.ids`, 12).map((x, i) => product(x, `${w}.ids[${i}]`, refs)) }),
  audio: (b, w, refs) => ({ product: product(b.product, `${w}.product`, refs), title: text(b.title, `${w}.title`, 120) }),
  countdown: (b, w) => {
    if (typeof b.at !== "string" || !WHEN.test(b.at) || Number.isNaN(Date.parse(b.at + ":00Z"))) bad(`${w}.at`, "pick a date and time");
    return { at: b.at, label: text(b.label, `${w}.label`, 120), done: text(b.done, `${w}.done`, 120) };
  },
  tabs: (b, w) => ({ items: panels(b.items, `${w}.items`) }),
  accordion: (b, w) => ({ items: panels(b.items, `${w}.items`) }),
  projects: (b, w) => ({ title: text(b.title, `${w}.title`, 120) }),
  follow: (b, w, refs) => ({ project: project(b.project, `${w}.project`, refs), label: text(b.label, `${w}.label`, 60) }),
  cart: (b, w) => ({ label: text(b.label, `${w}.label`, 60) }),
  divider: () => ({}),
  spacer: () => ({})
};
export const ELEMENT_TYPES = Object.keys(ELEMENTS);

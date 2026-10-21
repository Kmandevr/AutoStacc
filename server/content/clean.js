// Input checks for project content made in the Studio (releases, news posts, shows; server/content/content.js): every
// field is validated and normalized here, so nothing a browser sends is stored as it came. Text is plain, or the safe
// markup of js/site-text.js for a news body (never HTML); links are https only; players must be a link
// js/site-embeds.js knows; artwork is one of the creator's own site images. Values migrated from data/ that these rules
// would refuse (root-relative artwork, a Deezer widget) are kept only while the request leaves them unchanged.
import { fail, str, int } from "../lib/http.js";
import { safeUrl } from "../sites/text.js";
import { embedFor } from "../sites/embeds.js";
import { ownImages } from "../sites/images.js";

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const bad = (field, message) => fail(400, "invalid_field", message, { field });
const has = (body, k) => Object.prototype.hasOwnProperty.call(body, k);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const text = (v, name, max) => (v === undefined || v === null ? "" : str(v, name, { min: 0, max }));
const optional = (v, name, max, pattern) => (v === undefined || v === null || v === "" ? null : str(v, name, { max, pattern }));
const bool = (v, name) => (typeof v === "boolean" ? v : bad(name, `${name} must be true or false.`));

export function date(v, name = "date") {
  const d = str(v, name, { max: 10, pattern: DATE });
  if (new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d) bad(name, `${name} is not a real date.`);
  return d;
}

export const slugOf = (v, name = "slug") => str(v, name, { max: 60, pattern: SLUG });
// A slug from a title when none is given ("Out Now!" -> "out-now").
export const slugFrom = (title) => title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "untitled";

export function https(v, name) {
  if (v === undefined || v === null || v === "") return null;
  const url = typeof v === "string" ? safeUrl(v) : null;
  if (!url || !url.startsWith("https://")) bad(name, `${name} must be an https link.`);
  return url;
}

function list(v, name, max, each) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max) bad(name, `${name} is a list of up to ${max}.`);
  return v.map((x, i) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) bad(name, `${name} ${i + 1} is not valid.`);
    return each(x, `${name} ${i + 1}`);
  });
}

// A player: a share link js/site-embeds.js turns into its own player, or the stored value left as it was.
function player(v, name, old) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string" && v === old) return old;
  if (typeof v !== "string" || v.length > 500 || !embedFor(v)) bad(name, `${name} must be a link from a player AutoStacc can embed.`);
  return new URL(v.trim()).href;
}

// Artwork: { asset, alt, width, height } with asset one of the creator's own active images, or the stored value unchanged.
async function artwork(db, creatorId, v, old) {
  if (v === undefined || v === null) return null;
  if (old && same(v, old)) return old;
  if (typeof v !== "object" || Array.isArray(v)) bad("artwork", "artwork is not valid.");
  const asset = str(v.asset, "artwork.asset", { max: 80, pattern: /^as_[a-z2-7]+$/ });
  const [own] = await ownImages(db, creatorId, [asset]);
  if (!own || !String(own.content_type).startsWith("image/")) bad("artwork", "Pick one of your own images for the artwork.");
  return { asset, width: int(v.width, "artwork.width", { min: 1, max: 10000 }), height: int(v.height, "artwork.height", { min: 1, max: 10000 }),
    alt: str(v.alt, "artwork.alt", { max: 300 }) };
}

// Each kind's fields: (body, old row's values, ctx) -> clean values for the fields the body names.
const FIELDS = {
  releases: {
    required: ["title", "type", "date"],
    slug: (b) => slugOf(b.slug),
    title: (b) => str(b.title, "title", { max: 200 }),
    type: (b) => (["Single", "EP", "Album"].includes(b.type) ? b.type : bad("type", "type is Single, EP or Album.")),
    date: (b) => date(b.date),
    upc: (b) => optional(b.upc, "upc", 14, /^\d{12,14}$/),
    description: (b) => text(b.description, "description", 2000),
    artwork: (b, old, ctx) => artwork(ctx.db, ctx.creatorId, b.artwork, old.artwork),
    tracks: (b) => list(b.tracks, "tracks", 60, (t, n) => ({ title: str(t.title, `${n} title`, { max: 200 }),
      duration: optional(t.duration, `${n} duration`, 8, /^\d{1,3}:[0-5]\d$/) || "", isrc: optional(t.isrc, `${n} isrc`, 12, /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/) || "" })),
    credits: (b) => list(b.credits, "credits", 60, (c, n) => ({ role: str(c.role, `${n} role`, { max: 80 }), name: str(c.name, `${n} name`, { max: 120 }) })),
    embedUrl: (b, old) => player(b.embedUrl, "embedUrl", old.embedUrl),
    fallbackEmbedUrl: (b, old) => player(b.fallbackEmbedUrl, "fallbackEmbedUrl", old.fallbackEmbedUrl),
    links: (b) => list(b.links, "links", 20, (l, n) => ({ name: str(l.name, `${n} name`, { max: 60 }), url: https(l.url, `${n} url`) || bad("links", `${n} needs a link.`) })),
    featured: (b) => bool(b.featured, "featured")
  },
  news: {
    required: ["title", "date"],
    slug: (b) => slugOf(b.slug),
    title: (b) => str(b.title, "title", { max: 200 }),
    date: (b) => date(b.date),
    tag: (b) => text(b.tag, "tag", 40),
    release: (b) => (b.release === null || b.release === "" ? null : slugOf(b.release, "release")),
    summary: (b) => text(b.summary, "summary", 300),
    body: (b) => text(b.body, "body", 20000)
  },
  shows: {
    required: ["date", "city"],
    date: (b) => date(b.date),
    city: (b) => str(b.city, "city", { max: 120 }),
    venue: (b) => text(b.venue, "venue", 120),
    ticketUrl: (b) => https(b.ticketUrl, "ticketUrl")
  }
};

export const KINDS = Object.keys(FIELDS);

// Clean values for the fields the body names (all required ones on create), plus `published` when it names that.
// old: the item's current values in the public field names ({} on create); ctx: { db, creatorId }.
export async function cleanContent(kind, body, { create = false, old = {}, ctx }) {
  const fields = FIELDS[kind];
  const out = {};
  for (const [k, fn] of Object.entries(fields)) {
    if (k === "required" || !has(body, k)) continue;
    out[k] = await fn(body, old, ctx);
  }
  if (create) for (const k of fields.required) if (!has(out, k)) bad(k, `${k} is required.`);
  if (create && kind !== "shows" && !out.slug) out.slug = slugFrom(out.title);
  if (has(body, "published")) out.published = bool(body.published, "published");
  if (!Object.keys(out).length) fail(400, "bad_request", "Nothing to change.");
  return out;
}

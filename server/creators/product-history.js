// Turns one saved edit of a Studio product into its release-history events (docs/studio.md, "Release"): publish,
// unpublish, pause, resume, remove, restore, a price change with { from, to }, and "edited" with the names of the
// fields that really changed. Pure diff in changeEvents; recordChanges writes them through server/creators/events.js.
import { parseJson } from "../lib/db.js";
import { recordEvent, recordEdit } from "./events.js";

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const sorted = (facets) => Object.fromEntries(Object.entries(facets || {}).filter(([, v]) => v && v.length).map(([k, v]) => [k, [...v].sort()]).sort(([a], [b]) => a.localeCompare(b)));

// Field name → how to read it from a products row.
const FIELDS = {
  title: (p) => p.title,
  description: (p) => p.description,
  type: (p) => p.type,
  tags: (p) => parseJson(p.tags, []),
  includes: (p) => parseJson(p.metadata, {}).includes || [],
  artwork: (p) => p.artwork,
  bpm: (p) => [p.bpm_min, p.bpm_max],
  specs: (p) => parseJson(p.metadata, {}).specs || {}
};

/** before/after: products rows; facetsBefore/facetsAfter: { field: [values] }. Returns [{ kind, detail }]. */
export function changeEvents(before, after, { facetsBefore = {}, facetsAfter = {} } = {}) {
  const out = [];
  const flip = (col, on, off) => {
    const a = Boolean(before[col]), b = Boolean(after[col]);
    if (a !== b) out.push({ kind: b ? on : off, detail: {} });
  };
  flip("deleted_at", "removed", "restored");
  if (!after.deleted_at || !before.published) flip("published", "published", "unpublished");
  flip("sales_paused", "paused", "resumed");
  if (before.price_cents !== after.price_cents) out.push({ kind: "price_changed", detail: { from: before.price_cents, to: after.price_cents } });
  const fields = Object.keys(FIELDS).filter((f) => !same(FIELDS[f](before), FIELDS[f](after)));
  if (!same(sorted(facetsBefore), sorted(facetsAfter))) fields.push("facets");
  if (fields.length) out.push({ kind: "edited", detail: { fields } });
  return out;
}

/** Writes the events of one change, in order. Edits close together by the same person are merged (autosave). */
export async function recordChanges(db, productId, actorId, events) {
  for (const e of events) {
    if (e.kind === "edited") await recordEdit(db, { productId, actorId, fields: e.detail.fields });
    else await recordEvent(db, { productId, kind: e.kind, actorId, detail: e.detail });
  }
}

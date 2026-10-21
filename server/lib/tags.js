// The store's one tag rule (docs/discovery.md): up to 8 tags, each lowercase letters, numbers and hyphens, at most 24
// characters. Product tags (server/creators/products.js) and the tags on releases and events (server/content/clean.js)
// follow it, so a tag means the same everywhere it is shown or filtered on.
import { fail } from "./http.js";

export const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 24;

export const isTag = (t) => typeof t === "string" && t.length <= MAX_TAG_LENGTH && TAG.test(t);

// A clean list of tags (duplicates dropped, order kept), or a 400 naming the field.
export function cleanTags(v, field = "tags") {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > MAX_TAGS || !v.every(isTag)) {
    fail(400, "invalid_field", `Up to ${MAX_TAGS} tags, each lowercase letters, numbers and hyphens.`, { field });
  }
  return [...new Set(v)];
}

// Stored tags as a list of valid tags, whatever the column held.
export const storedTags = (raw) => {
  let v = raw;
  if (typeof raw === "string") try { v = JSON.parse(raw); } catch { v = []; }
  return Array.isArray(v) ? v.filter(isTag).slice(0, MAX_TAGS) : [];
};

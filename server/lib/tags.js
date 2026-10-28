// The one tag rule (docs/discovery.md, docs/community.md "Tags"; owner, 2026-10-27, #230): anything can carry up to 8
// tags of at most 24 characters, typed freely. A typed tag is folded, not refused: case and accents go, spaces and
// other separators become hyphens, a leading "#" is dropped ("#Lo Fi" is "lo-fi"), so #Techno and #techno are one tag.
// A tag with a strong word or a slur is refused (server/lib/words.js). Products, releases, events, creators, projects,
// community spaces and takes all follow it, so a tag means the same everywhere it is shown, suggested or searched.
import { fail } from "./http.js";
import { checkName } from "./words.js";

export const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 24;

export const isTag = (t) => typeof t === "string" && t.length <= MAX_TAG_LENGTH && TAG.test(t);

// The tag a typed text stands for, or "" when nothing of it is left.
export const foldTag = (raw) => String(raw || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/^#+/, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, MAX_TAG_LENGTH).replace(/-+$/, "");

// A clean list of tags (folded, duplicates dropped, order kept), or a 400 naming the field. max: fewer than 8 allowed.
export function cleanTags(v, field = "tags", max = MAX_TAGS) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max * 2 || v.some((t) => typeof t !== "string" || t.length > 100)) {
    fail(400, "invalid_field", `Up to ${max} tags.`, { field });
  }
  const out = [...new Set(v.map(foldTag).filter(Boolean))];
  if (out.length > max) fail(400, "invalid_field", `Up to ${max} tags.`, { field });
  for (const t of out) checkName(t.replace(/-/g, " "), field, "Tags");
  return out;
}

// Stored tags as a list of valid tags, whatever the column held.
export const storedTags = (raw) => {
  let v = raw;
  if (typeof raw === "string") try { v = JSON.parse(raw); } catch { v = []; }
  return Array.isArray(v) ? v.filter(isTag).slice(0, MAX_TAGS) : [];
};

// AutoStacc's starter tags (owner, 2026-10-20): the store's own words for genre, style, DAW, plugin, content and level,
// so a take about "Serum" and a product that uses it speak the same language. Built from the store's vocabulary
// (server/discovery/vocabulary.js), the one source for those words; the first facet to use a word keeps it.
import { FACETS } from "../../../discovery/vocabulary.js";

export const key = (label) => String(label).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const USED = ["genre", "style", "daw", "plugin", "contents", "skill"];
export const STARTER = (() => {
  const seen = new Set();
  const out = [];
  for (const f of USED) {
    for (const label of Object.values(FACETS[f].values)) {
      const k = key(label);
      if (k && !seen.has(k)) { seen.add(k); out.push({ key: k, label }); }
    }
  }
  return out;
})();
export const STARTER_KEYS = new Set(STARTER.map((t) => t.key));

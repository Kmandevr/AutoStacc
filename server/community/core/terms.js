// Turning what someone typed into words to look for (search, similar takes): folded (case and accents), split on
// anything that isn't a letter or digit, common words and one-letter words dropped, at most six, each ready for a LIKE
// that matches it anywhere in a title or post. LIKE wildcards in the text are escaped, so a search for "100%" finds
// that, never everything. Plain comparisons only: nothing the visitor types is ever run as an expression.
import { fold } from "./wording.js";

const STOP = new Set(["the", "and", "for", "are", "but", "not", "you", "with", "how", "what", "can", "does", "why", "this", "that", "from", "have", "has", "was", "its", "who", "any", "into", "your", "get"]);
export const MAX_TERMS = 6;

export function terms(raw) {
  const words = fold(String(raw || "").slice(0, 300)).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w));
  return [...new Set(words)].slice(0, MAX_TERMS);
}

// "%word%" with LIKE's own characters escaped; use with ESCAPE '\'.
export const likeTerm = (w) => `%${w.replace(/[\\%_]/g, "\\$&")}%`;

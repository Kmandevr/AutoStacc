// Feature switches (docs/packs.md, "Replaceability": a feature can be switched off or replaced without breaking
// uploads, purchases or downloads). Each switch guards its own routes (404 when off) and the browser hides its buttons
// (data/features.js, generated from FEATURES by scripts/build.js). A deployment can also switch any of them off without
// a code change: FEATURES_OFF, comma-separated names, in the environment. Uploads of single files, checkout, the
// library and single-file downloads never depend on a switch.
import { fail } from "./http.js";

export const FEATURES = {
  // The Pack Builder: the Control Center's Packs tab and /api/admin/packs/* (existing files stay delivered when off).
  "packs.builder": { on: true, label: "Pack Builder" },
  // Suggested kinds, instruments, tempos and keys from names and headers (the vocabulary sent with engine jobs).
  "packs.suggestions": { on: true, label: "Suggestions from names and headers" },
  // Listening to audio (engine analysis: tempo, key, a waveform, silent or undecodable files for the automated review).
  // Only with suggestions on; off, jobs run faster and suggestions come from names and headers alone.
  "packs.analysis": { on: true, label: "Tempo and key from listening to audio" },
  // Several files as one ZIP: "Download folder (ZIP)" and /api/downloads/bundle (single downloads always work).
  "downloads.bundles": { on: true, label: "ZIP downloads" },
  // Your Stacc's personal collections, tags and saved searches (/api/collections, /api/tags, /api/saved-searches; the
  // library itself and every download work without them).
  "library.collections": { on: true, label: "Collections, tags and saved searches" },
  // Store filters, search and recommendations from what a product's published files contain (server/discovery/
  // contents.js). Off, the files' tempo range stops counting at once and the derived values leave the store at the
  // next daily sweep (or the next publish); products keep their creators' own details. On again, the sweep restores them.
  "store.derivedFacets": { on: true, label: "Store filters from file contents" },
  // A product page's "What's inside" (GET /api/products/:id/contents): its folders and files, before purchase.
  "product.contentsTree": { on: true, label: "What's inside on product pages" }
};

const offIn = (env) => new Set(String((env && env.FEATURES_OFF) || "").split(",").map((s) => s.trim()).filter(Boolean));

export const isOn = (app, name) => Boolean(FEATURES[name] && FEATURES[name].on) && !offIn(app.env).has(name);

/** Ends the request with 404 (like a route that doesn't exist) when the feature is off. */
export function requireFeature(app, name) {
  if (!isOn(app, name)) fail(404, "not_found", "Not found.");
}

/** What the browser needs: { name: true|false } (data/features.js). */
export const browserFeatures = () => Object.fromEntries(Object.entries(FEATURES).map(([k, f]) => [k, f.on]));

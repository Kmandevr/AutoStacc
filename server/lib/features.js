// Feature switches (docs/packs.md, "Replaceability": a feature can be switched off or replaced without breaking
// uploads, purchases or downloads). Each switch guards its own routes (404 when off) and the browser hides its buttons
// (data/features.js, generated from FEATURES by scripts/build.js). A deployment can also switch any of them off without
// a code change: FEATURES_OFF, comma-separated names, in the environment; and one that is off by default on with
// FEATURES_ON (off wins if a name is in both). Uploads of single files, checkout, the
// library and single-file downloads never depend on a switch.
import { fail } from "./http.js";

export const FEATURES = {
  // The Pack Builder: the Control Center's Packs tab and /api/admin/packs/* (existing files stay delivered when off).
  "packs.builder": { on: true, label: "Pack Builder" },
  // Suggested kinds, instruments, tempos and keys from names and headers (the vocabulary sent with engine jobs).
  "packs.suggestions": { on: true, label: "Suggestions from names and headers" },
  // The Pac editor: building a Pac one thing at a time (add files into folders, new folders, remove, a read me written
  // in the builder, drafts copied from the live version; server/packs/editor-routes.js). Off, a Pac is built from one
  // upload as before.
  "packs.editor": { on: true, label: "Pac editor (one file at a time)" },
  // Listening to audio (engine analysis: tempo, key, a waveform, silent or undecodable files for the automated review).
  // Only with suggestions on; off, jobs run faster and suggestions come from names and headers alone.
  "packs.analysis": { on: true, label: "Tempo and key from listening to audio" },
  // Several files as one ZIP: "Download folder (ZIP)" and /api/downloads/bundle (single downloads always work).
  "downloads.bundles": { on: true, label: "ZIP downloads" },
  // Small compressible files (MIDI, presets, text) deflated inside ZIP downloads, from copies the daily sweep makes
  // and checks (server/downloads/variants.js). Off by default (docs/packs.md §8); off, ZIPs are stored as before.
  "downloads.deflate": { on: false, label: "Smaller ZIPs for MIDI, presets and text" },
  // Your Stacc's personal collections, tags and saved searches (/api/collections, /api/tags, /api/saved-searches; the
  // library itself and every download work without them).
  "library.collections": { on: true, label: "Collections, tags and saved searches" },
  // Store filters, search and recommendations from what a product's published files contain (server/discovery/
  // contents.js). Off, the files' tempo range stops counting at once and the derived values leave the store at the
  // next daily sweep (or the next publish); products keep their creators' own details. On again, the sweep restores them.
  "store.derivedFacets": { on: true, label: "Store filters from file contents" },
  // A product page's "What's inside" (GET /api/products/:id/contents): its folders and files, before purchase.
  "product.contentsTree": { on: true, label: "What's inside on product pages" },
  // Two-step sign-in for admin accounts: authenticator-app codes (TOTP) and one-time backup codes, through Better
  // Auth's twoFactor plugin (server/auth/two-factor.js). Built but off by default (owner, 2026-10-15); off, the plugin
  // isn't loaded, so /api/auth/two-factor/* doesn't exist and sign-in is password only, exactly as before.
  "auth.adminTwoFactor": { on: false, label: "Two-step sign-in for admins" },
  // The community (docs/community.md): spaces, threads, posting and moderation under /community and /api/community/*.
  // Off until moderation and the launch gates are done (docs/community-safety.md); off, those addresses are 404 and
  // nothing community-related shows. Its tables (migration 0031) exist either way and stay empty.
  "community.forum": { on: false, label: "Community" },
  // The community's features (server/community/features/), each switchable on its own; they only work while
  // community.forum is on. Off, a feature's routes are 404, its parts leave the pages and its data stays stored.
  "community.boost": { on: true, label: "Community: Boost (upvotes)" },
  "community.qa": { on: true, label: "Community: Helpful votes and best answers" },
  "community.waves": { on: true, label: "Community: waveforms beside names" },
  "community.preview": { on: true, label: "Community: Preview while writing" },
  "community.pace": { on: true, label: "Community: slow mode and posting pace" },
  "community.moderation": { on: true, label: "Community: team tools, bans and appeals" },
  "community.reports": { on: true, label: "Community: reports and the team's queue" },
  "community.blocks": { on: true, label: "Community: blocking people" },
  "community.crisis": { on: true, label: "Community: help lines beside self-harm wording" },
  "community.upkeep": { on: true, label: "Community: read-only after 40 days without a team" },
  "community.legal": { on: true, label: "Community: AutoStacc's report queue and suspensions" },
  "community.textOnly": { on: true, label: "Community: no links from accounts at three copyright strikes" },
  "community.embeds": { on: true, label: "Community: music players from SoundCloud, YouTube, Spotify and Apple Music links" },
  "community.cards": { on: true, label: "Community: preview cards for AutoStacc links" },
  "community.codeblocks": { on: true, label: "Community: code and settings blocks" },
  "community.linkRules": { on: true, label: "Community: link approval (safe list, ban list, team's allowed sites)" },
  "community.wordFilter": { on: true, label: "Community: word and phrase filters" },
  "community.newAccount": { on: true, label: "Community: rules for new accounts and new members" },
  "community.patterns": { on: true, label: "Community: pattern rules built from a form" },
  "community.follows": { on: true, label: "Community: follow a take" },
  "community.joined": { on: true, label: "Community: join a space (its takes first)" },
  "community.saved": { on: true, label: "Community: save for later" },
  "community.mentions": { on: true, label: "Community: @mentions" },
  "community.inbox": { on: true, label: "Community: on-site inbox (the bell)" }
};

const listIn = (env, key) => new Set(String((env && env[key]) || "").split(",").map((s) => s.trim()).filter(Boolean));

export const isOn = (app, name) => Boolean(FEATURES[name]) && (FEATURES[name].on || listIn(app.env, "FEATURES_ON").has(name)) && !listIn(app.env, "FEATURES_OFF").has(name);

/** Ends the request with 404 (like a route that doesn't exist) when the feature is off. */
export function requireFeature(app, name) {
  if (!isOn(app, name)) fail(404, "not_found", "Not found.");
}

/** What the browser needs: { name: true|false } (data/features.js). */
export const browserFeatures = () => Object.fromEntries(Object.entries(FEATURES).map(([k, f]) => [k, f.on]));

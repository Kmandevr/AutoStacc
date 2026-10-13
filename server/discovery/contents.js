// What a product's published files contain (docs/packs.md, Phase 7, section 10): kinds, formats, instruments, keys,
// sample rates, bit depths, DAWs, plugins and the tempo range, counted from each file's published details
// (product_files.meta, the snapshot a Pac version's publishing wrote; drafts never count). Stored in product_contents
// for the product page, and, while the store.derivedFacets switch is on, as product_facets rows with origin 'derived',
// so the store's filters, search and recommendations find the product when at least one file matches. A creator's own
// facet values are never touched (facets.js keeps them apart), and a creator's tempo range wins over the files'.
import { all, stmt, now, parseJson } from "../lib/db.js";
import { isOn } from "../lib/features.js";
import { FACETS, KINDS, FORMATS, BPM, kindOf, formatOfExtension } from "./vocabulary.js";
import { refreshSearchText, restoreDerivedStmt } from "./facets.js";

// Formats that say which DAW or plugin a file is for.
const DAW = { als: "ableton-live", alp: "ableton-live", adg: "ableton-live", adv: "ableton-live", flp: "fl-studio", logicx: "logic-pro",
  rpp: "reaper", ptx: "pro-tools", cpr: "cubase", "bitwig-project": "bitwig", "bitwig-clip": "bitwig", "bitwig-preset": "bitwig" };
const PLUGIN = { vital: "vital", serum: "serum", nmsv: "massive" };
const ext = (name) => (String(name).match(/\.([^.]+)$/) || [])[1] || "";

/** files: [{ kind, filename, size_bytes, meta }] → { files, bytes, kinds: { kind: n }, facets: { facet: { value: n } }, bpm: [lo, hi] | null }. Pure. */
export function deriveContents(files) {
  const facets = {};
  const kinds = {};
  const count = (facet, value) => {
    if (!value || !FACETS[facet] || !FACETS[facet].values[value]) return;
    const f = (facets[facet] ||= {});
    f[value] = (f[value] || 0) + 1;
  };
  let lo = null, hi = null, bytes = 0;
  for (const file of files) {
    const meta = typeof file.meta === "string" ? parseJson(file.meta, {}) : file.meta || {};
    const values = meta.values || {};
    const facts = meta.facts || {};
    bytes += file.size_bytes || 0;
    const kind = kindOf((values.kind && values.kind.value) || file.kind || "") || "other";
    kinds[kind] = (kinds[kind] || 0) + 1;
    count("contents", KINDS[kind] && KINDS[kind].contents);
    const format = FORMATS[meta.format] ? meta.format : formatOfExtension(ext(file.filename));
    count("format", format && FORMATS[format].facet);
    count("daw", DAW[format]);
    count("plugin", PLUGIN[format]);
    count("instrument", values.instrument && values.instrument.value);
    count("key", values.key && values.key.value);
    count("sample-rate", facts.sampleRate && String(facts.sampleRate));
    count("bit-depth", facts.bitDepth && String(facts.bitDepth));
    const bpm = Number(values.bpm && values.bpm.value);
    if (Number.isFinite(bpm) && bpm >= BPM.min && bpm <= BPM.max) {
      lo = lo === null ? bpm : Math.min(lo, bpm);
      hi = hi === null ? bpm : Math.max(hi, bpm);
    }
  }
  return { files: files.length, bytes, kinds, facets, bpm: lo === null ? null : [Math.round(lo), Math.round(hi)] };
}

/** Works out one product's contents again from its published Pack Builder files and stores them (after a publish). */
export async function refreshContents(app, productId) {
  const db = app.db;
  const files = await all(db, `SELECT kind, filename, size_bytes, meta FROM product_files
    WHERE product_id = ? AND active = 1 AND status = 'published' AND retired_at IS NULL AND version_id IS NOT NULL`, productId);
  const c = deriveContents(files);
  const indexed = files.length && isOn(app, "store.derivedFacets") ? 1 : 0;
  await db.batch([
    stmt(db, "DELETE FROM product_facets WHERE product_id = ? AND origin = 'derived'", productId),
    files.length
      ? stmt(db, `INSERT INTO product_contents (product_id, summary, bpm_min, bpm_max, indexed, updated_at) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (product_id) DO UPDATE SET summary = excluded.summary, bpm_min = excluded.bpm_min, bpm_max = excluded.bpm_max,
          indexed = excluded.indexed, updated_at = excluded.updated_at`, productId, JSON.stringify(c), c.bpm ? c.bpm[0] : null, c.bpm ? c.bpm[1] : null, indexed, now())
      : stmt(db, "DELETE FROM product_contents WHERE product_id = ?", productId),
    restoreDerivedStmt(db, productId)
  ]);
  await refreshSearchText(db, productId);
  return c;
}

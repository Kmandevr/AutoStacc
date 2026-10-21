// SQL helpers for db/catalog.sql (lib/platform-catalog.js writes it): a value as an SQL literal, and SQLite's "now".
// The code-based product sync that lived here is retired (owner, 2026-10-21, #176): products, Stacclets and Pacs are
// made in the Studio like every creator's, and migration 0042 retired the rows the sync had left (source 'catalog').
// Deterministic: timestamps come from SQLite at apply time, never from this script.

const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

module.exports = { q, NOW };

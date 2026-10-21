// Content relationships (data/relationships.js) for one thing, in both directions: what it was built from, remixes,
// samples or evolved from ("outgoing"), and where it was used ("incoming", with the reverse label). Pure.
// Not used by scripts/build.js since 2026-10-21: its only reader was the generated release pages, which are now
// server-rendered from the Studio (server/content/render.js has no connections section yet). Kept, with its unit test,
// for when connections return to those pages; delete it if they don't (docs/decisions.md, 2026-10-21).
function relationsOf(data, ref) {
  const types = data.relationshipTypes || {};
  const group = (edges, side, labelKey) => {
    const out = new Map();
    for (const e of edges) {
      const label = (types[e.type] || {})[labelKey] || e.type;
      if (!out.has(label)) out.set(label, []);
      out.get(label).push(e[side]);
    }
    return [...out].map(([label, refs]) => ({ label, refs }));
  };
  const rels = data.relationships || [];
  return {
    outgoing: group(rels.filter((r) => r.from === ref), "to", "label"),
    incoming: group(rels.filter((r) => r.to === ref), "from", "reverse")
  };
}

module.exports = { relationsOf };

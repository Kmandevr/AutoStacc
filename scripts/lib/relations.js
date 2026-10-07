// Content relationships (data/relationships.js) for one thing, in both directions: what it was built from, remixes,
// samples or evolved from ("outgoing"), and where it was used ("incoming", with the reverse label). Pure.
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

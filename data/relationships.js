// Relationships between pieces of content: which track was built from which fragment, what remixes what. Generic:
// any project whose `features` include "relationships" (data/projects.js) can use them. Model: docs/architecture.md.
// Releases are Studio content in the store database now, so data/ can't check a link to one and refuses it.
// RELATIONSHIPS: [{ from: "kind:id", to: "kind:id", type }] read as "<from> <type> <to>", e.g.
//   { from: "pac:new-loops", to: "pac:older-loops", type: "evolved-from" }.
//   kind is product, stacclet, pac or poll; the id must exist in its data file. Only confirmed links.
// RELATIONSHIP_TYPES: label is shown on the `from` side, reverse on the `to` side.
window.RELATIONSHIP_TYPES = {
  "built-from": { label: "Built from", reverse: "Featured in" },
  "remix-of": { label: "Remix of", reverse: "Remixed as" },
  samples: { label: "Samples", reverse: "Sampled in" },
  "evolved-from": { label: "Evolved from", reverse: "Evolved into" }
};
window.RELATIONSHIPS = [];

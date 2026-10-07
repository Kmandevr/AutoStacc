// Relationships between pieces of content: which track was built from which fragment, what remixes what. Generic:
// any project whose `features` include "relationships" (data/projects.js) can use them. Release pages show both
// directions ("Built from" and "Featured in"). Model: docs/architecture.md.
// RELATIONSHIPS: [{ from: "kind:id", to: "kind:id", type }] read as "<from> <type> <to>", e.g.
//   { from: "release:new-track", to: "release:older-track", type: "built-from" }.
//   kind is release, product, stacclet, pac or poll; the id must exist in its data file. Only confirmed links.
// RELATIONSHIP_TYPES: label is shown on the `from` side, reverse on the `to` side.
window.RELATIONSHIP_TYPES = {
  "built-from": { label: "Built from", reverse: "Featured in" },
  "remix-of": { label: "Remix of", reverse: "Remixed as" },
  samples: { label: "Samples", reverse: "Sampled in" },
  "evolved-from": { label: "Evolved from", reverse: "Evolved into" }
};
window.RELATIONSHIPS = [];

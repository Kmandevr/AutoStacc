// Stacclets: collections of related Pacs from one project (a release's worth of material, a series, a theme). A
// Stacclet never holds files itself; its Pacs do (data/pacs.js). Model: docs/architecture.md.
// Fields: id (lowercase-hyphenated, permanent), project (an id in data/projects.js), title, description (plain text),
//   draft: true = placeholder, hidden until real.
window.STACCLETS = [
  {
    id: "frayed-signals",
    project: "glitches-and-stitches",
    title: "Frayed Signals",
    description: "Material around the Frayed Signals sample pack.",
    draft: true
  }
];

// Projects: the creators on AutoStacc. Everything a project publishes names it with `project: "<id>"` (products,
// releases, news posts, Stacclets, polls), so adding a project is data, not code. Synced into the store database by
// db/catalog.sql (`node scripts/build.js`). Model: docs/architecture.md; contract: docs/projects.md.
// Fields:
//   id: lowercase-hyphenated, permanent. name: as the project writes it (shown as "by <name>").
//   summary: one plain-text line for the /projects directory, confirmed facts only. home: its main page on this site.
//   features: the platform features it uses: "releases", "news", "shows", "store", "polls", "relationships".
//     Polls and relationships are refused by the build for projects that don't list them.
//   draft: true keeps it off /projects and out of the store database.
window.PROJECTS = [
  {
    id: "glitches-and-stitches",
    name: "Glitches & Stitches",
    summary: "An electronic music project that treats unfinished songs as raw material: fragments are torn out, stitched into new tracks and glitched into something new.",
    home: "/",
    features: ["releases", "news", "shows", "store", "polls", "relationships"]
  }
];

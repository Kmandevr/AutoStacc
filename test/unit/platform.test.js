// The platform layer's data (docs/architecture.md): Project → Stacclet → Pac links, products selling Pacs, polls and
// relationships, the real data/ files, a hypothetical second project added with data only, and the database sync.
// Releases, news and shows are Studio content in the store database (server/content/), so data/ can't refer to them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadData } = require("../../scripts/lib/data.js");
const { validate, pacProject, refProject } = require("../../scripts/lib/platform.js");
const { relationsOf } = require("../../scripts/lib/relations.js");
const { platformSql } = require("../../scripts/lib/platform-catalog.js");
const { catalogSql } = require("../../scripts/lib/catalog.js");

// A small, complete platform: two projects, one using polls and relationships, one using only the store.
function fixture() {
  return {
    creators: [{ id: "autostacc", name: "AutoStacc", firstParty: true }],
    projects: [
      { id: "glitches-and-stitches", name: "Glitches & Stitches", creator: "autostacc", features: ["store", "polls", "relationships"] },
      { id: "second-project", name: "Second Project", creator: "autostacc", features: ["store"] }
    ],
    stacclets: [
      { id: "frayed-signals", project: "glitches-and-stitches", title: "Frayed Signals" },
      { id: "second-kit", project: "second-project", title: "Second Kit" }
    ],
    pacs: [
      { id: "fs-midi", stacclet: "frayed-signals", title: "MIDI Pac" },
      { id: "fs-samples", stacclet: "frayed-signals", title: "Samples Pac" },
      { id: "second-presets", stacclet: "second-kit", title: "Presets Pac" }
    ],
    products: [
      { id: "fs-pack", project: "glitches-and-stitches", pacs: ["fs-midi", "fs-samples"] },
      { id: "second-pack", project: "second-project", pacs: ["second-presets"] }
    ],
    polls: [{ id: "next", project: "glitches-and-stitches", question: "What next?", options: [{ id: "finish-it", label: "Finish it" }, { id: "scrap-it", label: "Scrap it" }] }],
    relationships: [{ from: "product:fs-pack", to: "pac:fs-midi", type: "built-from" }],
    relationshipTypes: { "built-from": { label: "Built from", reverse: "Featured in" } }
  };
}

test("the real data/ files form a valid hierarchy", () => {
  const data = loadData();
  assert.deepEqual(validate(data), []);
  assert.ok(data.projects.some((p) => p.id === "glitches-and-stitches"));
  for (const p of data.products) assert.ok(p.project, `${p.id} names its project`);
  // Content lives in the store database now: the loader no longer reads release, news or show files.
  for (const gone of ["releases", "allReleases", "news", "allNews", "shows"]) assert.equal(data[gone], undefined, gone);
});

test("Project → Stacclet → Pac links resolve through stored ids only", () => {
  const data = fixture();
  assert.deepEqual(validate(data), []);
  assert.equal(pacProject(data, "fs-midi"), "glitches-and-stitches");
  assert.equal(pacProject(data, "second-presets"), "second-project");
  assert.equal(refProject(data, "pac:fs-samples"), "glitches-and-stitches");
  assert.equal(refProject(data, "stacclet:second-kit"), "second-project");
  assert.equal(pacProject(data, "ghost"), undefined);
  // Pacs don't repeat their project: it comes from the Stacclet.
  assert.ok(data.pacs.every((p) => !("project" in p)));
});

test("a second project is data only: it validates, syncs and keeps its own features", () => {
  const data = fixture();
  assert.deepEqual(validate(data), []);
  assert.equal(pacProject(data, data.products[1].pacs[0]), data.products[1].project);
  const sql = platformSql(data);
  assert.match(sql, /'second-project', 'Second Project', '\["store"\]', 1, 'autostacc', 'second-project', 'catalog'/);
  assert.match(sql, /INSERT INTO creators \(id, slug, name, source, trusted, published, catalog_hash.*'autostacc', 'autostacc', 'AutoStacc', 'catalog', 1, 1/,
    "first-party creators are trusted (their release and news pages are indexed)");
  // Each project's look for server-rendered pages comes from its data; no activity column is written any more.
  const looks = fixture();
  looks.projects[0].skin = true;
  looks.projects[0].sounds = true;
  assert.match(platformSql(looks), /'glitches-and-stitches', 'Glitches & Stitches', .*'\{"skin":true,"sounds":true\}'/);
  assert.doesNotMatch(sql, /activity/);
  // The sync owns only first-party rows: Studio creators and projects are never overwritten or removed by it.
  assert.match(sql, /UPDATE creators SET .* WHERE source = 'catalog' AND deleted_at IS NULL/);
  assert.match(sql, /UPDATE projects SET .* WHERE source = 'catalog' AND deleted_at IS NULL/);
  assert.match(sql, /WHERE projects.source = 'catalog' AND \(/);
  assert.match(sql, /id NOT IN \('glitches-and-stitches', 'second-project'\)/);
  // It doesn't use polls or relationships, so it can't publish them.
  const withPoll = fixture();
  withPoll.polls.push({ id: "theirs", project: "second-project", question: "?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] });
  assert.match(validate(withPoll).join("\n"), /poll theirs: project "second-project" doesn't use polls/);
  const withRel = fixture();
  withRel.relationships.push({ from: "product:second-pack", to: "pac:fs-midi", type: "built-from" });
  assert.match(validate(withRel).join("\n"), /project of "product:second-pack" doesn't use relationships/);
});

test("broken links fail the build", () => {
  const cases = [
    [(d) => (d.stacclets[0].project = "nope"), /stacclet frayed-signals: project "nope"/],
    [(d) => (d.pacs[0].stacclet = "nope"), /pac fs-midi: stacclet "nope"/],
    [(d) => (d.products[0].pacs = ["ghost"]), /pac "ghost" is not in data\/pacs.js/],
    [(d) => (d.products[0].pacs = ["second-presets"]), /pac "second-presets" belongs to another project/],
    [(d) => (d.pacs[0].draft = true), /published product can't sell the draft pac "fs-midi"/],
    [(d) => delete d.products[0].project, /product fs-pack: add project/],
    [(d) => d.pacs.push({ id: "fs-midi", stacclet: "frayed-signals" }), /pac "fs-midi": duplicate id/],
    [(d) => (d.polls[0].options = [{ id: "only", label: "Only" }]), /needs at least two options/],
    [(d) => (d.relationships[0].to = "pac:ghost"), /"pac:ghost" doesn't exist/],
    // Releases are made in the Studio: data/ can't point at one, and says why.
    [(d) => (d.relationships[0].to = "release:frayed"), /"release:frayed" doesn't exist \(releases are made in the Studio/],
    [(d) => (d.polls[0].about = "release:frayed"), /poll next: about "release:frayed" doesn't exist \(releases are made in the Studio/],
    [(d) => (d.relationships[0].type = "invented"), /type is not in RELATIONSHIP_TYPES/],
    [(d) => (d.projects[1].features = ["telepathy"]), /unknown feature "telepathy"/],
    [(d) => delete d.projects[1].creator, /project second-project: add creator/],
    [(d) => (d.projects[1].creator = "nobody"), /creator "nobody" is not in data\/creators.js/],
    [(d) => d.creators.push({ id: "Some_One", name: "X", firstParty: true }), /creator Some_One: id must be lowercase-hyphenated/],
    [(d) => d.creators.push({ id: "new-label", name: "X", firstParty: true }), /creator new-label: add "new-label" to RESERVED/],
    [(d) => d.creators.push({ id: "someone", name: "X" }), /creator someone: creators in data\/creators.js are first-party/],
    [(d) => delete d.creators[0].firstParty, /creator autostacc: id is a reserved platform address/],
    [(d) => (d.creators[0].draft = true), /published project can't belong to the draft creator/]
  ];
  for (const [breakIt, error] of cases) {
    const d = fixture();
    breakIt(d);
    assert.match(validate(d).join("\n"), error);
  }
  // A draft product may list a draft Pac (placeholders stay linked).
  const d = fixture();
  d.pacs[0].draft = true;
  d.products[0].draft = true;
  assert.deepEqual(validate(d), []);
});

test("relationships read both ways", () => {
  const data = fixture();
  assert.deepEqual(relationsOf(data, "product:fs-pack"), { outgoing: [{ label: "Built from", refs: ["pac:fs-midi"] }], incoming: [] });
  assert.deepEqual(relationsOf(data, "pac:fs-midi"), { outgoing: [], incoming: [{ label: "Featured in", refs: ["product:fs-pack"] }] });
});

test("the catalog sync carries each product's project and Pacs, deterministically", () => {
  const product = { id: "fs-pack", title: "Pack", type: "music", price: 5, currency: "USD", project: "glitches-and-stitches", pacs: ["fs-midi"] };
  const sql = catalogSql([product], { music: { label: "Music", maxQuantity: 1 } });
  assert.match(sql, /'glitches-and-stitches', '\["fs-midi"\]'/);
  assert.equal(platformSql(fixture()), platformSql(fixture()));
  assert.match(platformSql(fixture()), /INSERT INTO polls .*'next', 'glitches-and-stitches', 'What next\?'/);
});

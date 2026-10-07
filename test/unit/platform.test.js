// The platform layer's data (docs/architecture.md): Project → Stacclet → Pac links, products selling Pacs, polls and
// relationships, the real data/ files, a hypothetical second project added with data only, and the database sync.
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
    projects: [
      { id: "glitches-and-stitches", name: "Glitches & Stitches", features: ["store", "polls", "relationships"] },
      { id: "second-project", name: "Second Project", features: ["store"] }
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
    allReleases: [{ id: "frayed", project: "glitches-and-stitches", title: "Frayed" }, { id: "fragment-03", project: "glitches-and-stitches", title: "Fragment 03" }],
    allNews: [],
    polls: [{ id: "next", project: "glitches-and-stitches", question: "What next?", options: [{ id: "finish-it", label: "Finish it" }, { id: "scrap-it", label: "Scrap it" }] }],
    relationships: [{ from: "release:frayed", to: "release:fragment-03", type: "built-from" }],
    relationshipTypes: { "built-from": { label: "Built from", reverse: "Featured in" } }
  };
}

test("the real data/ files form a valid hierarchy", () => {
  const data = loadData();
  assert.deepEqual(validate(data), []);
  assert.ok(data.projects.some((p) => p.id === "glitches-and-stitches"));
  for (const p of data.products) assert.ok(p.project, `${p.id} names its project`);
  for (const r of data.allReleases) assert.ok(r.project, `${r.id} names its project`);
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
  assert.match(sql, /'second-project', 'Second Project', '\["store"\]', 1/);
  assert.match(sql, /id NOT IN \('glitches-and-stitches', 'second-project'\)/);
  // It doesn't use polls or relationships, so it can't publish them.
  const withPoll = fixture();
  withPoll.polls.push({ id: "theirs", project: "second-project", question: "?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] });
  assert.match(validate(withPoll).join("\n"), /poll theirs: project "second-project" doesn't use polls/);
  const withRel = fixture();
  withRel.relationships.push({ from: "product:second-pack", to: "release:frayed", type: "built-from" });
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
    [(d) => (d.relationships[0].to = "release:ghost"), /"release:ghost" doesn't exist/],
    [(d) => (d.relationships[0].type = "invented"), /type is not in RELATIONSHIP_TYPES/],
    [(d) => (d.projects[1].features = ["telepathy"]), /unknown feature "telepathy"/]
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
  assert.deepEqual(relationsOf(data, "release:frayed"), { outgoing: [{ label: "Built from", refs: ["release:fragment-03"] }], incoming: [] });
  assert.deepEqual(relationsOf(data, "release:fragment-03"), { outgoing: [], incoming: [{ label: "Featured in", refs: ["release:frayed"] }] });
});

test("the catalog sync carries each product's project and Pacs, deterministically", () => {
  const product = { id: "fs-pack", title: "Pack", type: "music", price: 5, currency: "USD", project: "glitches-and-stitches", pacs: ["fs-midi"] };
  const sql = catalogSql([product], { music: { label: "Music", maxQuantity: 1 } });
  assert.match(sql, /'glitches-and-stitches', '\["fs-midi"\]'/);
  assert.equal(platformSql(fixture()), platformSql(fixture()));
  assert.match(platformSql(fixture()), /INSERT INTO polls .*'next', 'glitches-and-stitches', 'What next\?'/);
});

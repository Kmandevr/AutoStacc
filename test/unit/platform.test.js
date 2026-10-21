// The platform layer's data (docs/architecture.md): creators, projects, polls and relationships in data/, the real
// files, a hypothetical second project added with data only, and the database sync. Products, Stacclets, Pacs,
// releases and events are Studio content in the store database (#176), so data/ neither holds nor refers to them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadData } = require("../../scripts/lib/data.js");
const { validate, refProject, resolveRef } = require("../../scripts/lib/platform.js");
const { relationsOf } = require("../../scripts/lib/relations.js");
const { platformSql } = require("../../scripts/lib/platform-catalog.js");

const options = [{ id: "finish-it", label: "Finish it" }, { id: "scrap-it", label: "Scrap it" }];
// A small, complete platform: two projects, one using polls and relationships, one using only the store.
function fixture() {
  return {
    creators: [{ id: "autostacc", name: "AutoStacc", firstParty: true }],
    projects: [
      { id: "glitches-and-stitches", name: "Glitches & Stitches", creator: "autostacc", features: ["releases", "events", "store", "polls", "relationships"] },
      { id: "second-project", name: "Second Project", creator: "autostacc", features: ["store"] }
    ],
    polls: [
      { id: "next", project: "glitches-and-stitches", question: "What next?", options },
      { id: "after", project: "glitches-and-stitches", question: "And after that?", options }
    ],
    relationships: [{ from: "poll:after", to: "poll:next", type: "evolved-from" }],
    relationshipTypes: { "evolved-from": { label: "Evolved from", reverse: "Evolved into" } }
  };
}

test("the real data/ files form a valid hierarchy with no code-defined products, Stacclets or Pacs", () => {
  const data = loadData();
  assert.deepEqual(validate(data), []);
  assert.ok(data.projects.some((p) => p.id === "glitches-and-stitches"));
  // Content lives in the store database now: the loader reads no product, Stacclet, Pac, release, news or show files.
  for (const gone of ["products", "stacclets", "pacs", "releases", "allReleases", "news", "allNews", "shows"]) assert.equal(data[gone], undefined, gone);
  for (const f of ["products", "stacclets", "pacs"]) assert.equal(existsSync(new URL(`../../data/${f}.js`, import.meta.url)), false, `data/${f}.js is retired`);
  // News waits for each creator's community (#174); shows became events (#178).
  for (const p of data.projects) {
    for (const f of ["news", "shows"]) assert.ok(!(p.features || []).includes(f), `${p.id} features ${f}`);
    assert.ok(!(p.pages || []).some((pg) => /news|shows/.test(pg.path)), `${p.id} nav links news or shows`);
  }
});

test("references resolve to polls only; Studio content can't be linked from data/, and the build says why", () => {
  const data = fixture();
  assert.deepEqual(validate(data), []);
  assert.equal(refProject(data, "poll:next"), "glitches-and-stitches");
  for (const ref of ["product:x", "stacclet:x", "pac:x", "release:x", "poll:ghost"]) assert.equal(resolveRef(data, ref), undefined, ref);
  for (const kind of ["product", "stacclet", "pac", "release"]) {
    const d = fixture();
    d.relationships[0].to = `${kind}:frayed`;
    assert.match(validate(d).join("\n"), new RegExp(`"${kind}:frayed" doesn't exist \\(it is made in the Studio`));
  }
});

test("a second project is data only: it validates, syncs and keeps its own features", () => {
  const data = fixture();
  const sql = platformSql(data);
  assert.match(sql, /'second-project', 'Second Project', '\["store"\]', 1, 'autostacc', 'second-project', 'catalog'/);
  assert.match(sql, /INSERT INTO creators \(id, slug, name, source, trusted, published, catalog_hash.*'autostacc', 'autostacc', 'AutoStacc', 'catalog', 1, 1/,
    "first-party creators are trusted (their pages are indexed)");
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
  // It never touches products, Stacclets or Pacs (#176).
  assert.doesNotMatch(sql, /\b(products|stacclets|pacs|product_facets)\b/);
  // It doesn't use polls or relationships, so it can't publish them.
  const withPoll = fixture();
  withPoll.polls.push({ id: "theirs", project: "second-project", question: "?", options });
  assert.match(validate(withPoll).join("\n"), /poll theirs: project "second-project" doesn't use polls/);
});

test("broken links fail the build", () => {
  const cases = [
    [(d) => (d.polls[0].options = [{ id: "only", label: "Only" }]), /needs at least two options/],
    [(d) => delete d.polls[0].project, /poll next: add project/],
    [(d) => (d.polls[0].project = "nope"), /poll next: project "nope" is not in data\/projects.js/],
    [(d) => d.polls.push({ ...d.polls[0] }), /poll "next": duplicate id/],
    [(d) => (d.relationships[0].to = "poll:ghost"), /"poll:ghost" doesn't exist/],
    [(d) => (d.relationships[0].to = "poll:after"), /links to itself/],
    [(d) => (d.polls[0].about = "release:frayed"), /poll next: about "release:frayed" doesn't exist \(it is made in the Studio/],
    [(d) => (d.relationships[0].type = "invented"), /type is not in RELATIONSHIP_TYPES/],
    [(d) => (d.projects[1].features = ["news"]), /unknown feature "news"/],
    [(d) => (d.projects[1].features = ["shows"]), /unknown feature "shows"/],
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
  // A relationship needs both ends' projects to use relationships.
  const d = fixture();
  d.projects[0].features = ["polls"];
  assert.match(validate(d).join("\n"), /project of "poll:after" doesn't use relationships/);
});

test("relationships read both ways", () => {
  const data = fixture();
  assert.deepEqual(relationsOf(data, "poll:after"), { outgoing: [{ label: "Evolved from", refs: ["poll:next"] }], incoming: [] });
  assert.deepEqual(relationsOf(data, "poll:next"), { outgoing: [], incoming: [{ label: "Evolved into", refs: ["poll:after"] }] });
});

test("the platform sync is deterministic and carries polls", () => {
  assert.equal(platformSql(fixture()), platformSql(fixture()));
  assert.match(platformSql(fixture()), /INSERT INTO polls .*'next', 'glitches-and-stitches', 'What next\?'/);
});

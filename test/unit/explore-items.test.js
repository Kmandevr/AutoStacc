// The /explore items (js/explore-items.js) from the content API's answer ({ releases, events }; news is gone): published
// items only (drafts, draft projects' items and ended events never appear, a bad answer is empty lists), releases newest
// first and events soonest first, search across title, project, place, tags and text, filters OR within and AND
// between, and each filter's counts worked out without itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const source = fs.readFileSync(path.resolve(import.meta.dirname, "../../js/explore-items.js"), "utf8");
const future = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

// The content API's shape (server/content/content.js): published items only, but the model still drops anything marked
// draft, of a draft or unknown project, or an event that has ended, in case a stale or tampered answer carries one.
const CONTENT = {
  releases: [
    { id: "r1", project: "a", type: "Single", date: "2025-10-15", title: "Hail", tracks: [{}] },
    { id: "r2", project: "b", type: "EP", date: "2026-02-01", title: "Thread", description: "Stitched loops", path: "/studio-maker/b/music/r2" },
    { id: "r3", project: "a", type: "Album", date: "2026-03-01", title: "Secret", draft: true },
    { id: "r4", project: "d", type: "Single", date: "2026-04-01", title: "Of a draft project" },
    { id: "r6", project: "", type: "Single", date: "2026-04-01", title: "Of no project" },
    { id: "r7", project: "a", type: "Single", title: "No date" }
  ],
  news: [{ id: "n1", project: "a", date: "2025-10-15", title: "Out now" }],
  events: [
    { id: "denver", project: "a", title: "Hall night", date: future(10), city: "Denver", venue: "Hall", country: "US", tags: ["live-set"], path: "/c/a/events/denver" },
    { id: "fest", project: "b", projectName: "Beta Studio", title: "Weekend", date: future(-1), endDate: future(1), city: "Austin", tags: [7, "festival"] },
    { id: "old", project: "a", title: "Gone", date: "2020-01-01", city: "Old" },
    { id: "draft", project: "b", title: "Patchbay", date: future(5), city: "Austin", draft: true }
  ]
};

function load({ content = CONTENT, latest } = {}) {
  const window = {
    PROJECTS: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }, { id: "d", name: "Hidden", draft: true }],
    GS: { projectPath: (id, ...rest) => ["", "c", id, ...rest].join("/"), ...(latest && { content: { latest } }) }
  };
  vm.runInNewContext(source, { window, Date, Math, Promise });
  // Arrays made inside the vm aren't this realm's; compare plain copies.
  const X = window.GS.exploreItems, plain = (f) => (...a) => JSON.parse(JSON.stringify(f(...a)));
  return { all: () => plain(X.from)(content), from: plain(X.from), query: plain(X.query), load: async () => JSON.parse(JSON.stringify(await X.load())) };
}

test("drafts, draft projects' items and ended events never appear; no news view; links go to the item's own page", () => {
  const X = load();
  const all = X.all();
  assert.deepEqual(Object.keys(all), ["releases", "events"]);
  assert.deepEqual(all.releases.map((r) => r.id), ["r1", "r2"]);
  assert.deepEqual(all.events.map((x) => x.city), ["Denver", "Austin"], "an event still running counts as upcoming");
  assert.equal(all.releases[0].href, "/c/a/music/r1");
  assert.equal(all.releases[1].href, "/studio-maker/b/music/r2", "the address the API gives wins");
  assert.equal(all.events[0].href, "/c/a/events/denver");
  assert.equal(all.events[1].href, "/c/b/events/fest", "else the project's events folder");
  assert.deepEqual(all.events[1].tags, ["festival"], "only text tags");
  assert.deepEqual(X.query("releases", all.releases, {}).hits.map((r) => r.id), ["r2", "r1"]);
  assert.deepEqual(X.query("events", all.events, {}).hits.map((x) => x.city), ["Austin", "Denver"], "soonest first");
});

test("a missing, empty or malformed answer gives empty lists, never an error", async () => {
  const X = load();
  for (const bad of [undefined, null, {}, { releases: null, events: 3 }, { releases: [null, 1, "x"], events: [null, "x"] }])
    assert.deepEqual(X.from(bad), { releases: [], events: [] }, JSON.stringify(bad));
  assert.deepEqual(await load().load(), { releases: [], events: [] }, "no content client: empty");
  const fetched = await load({ latest: () => Promise.resolve(CONTENT) }).load();
  assert.deepEqual(fetched.releases.map((r) => r.id), ["r1", "r2"], "load() reads the content client");
});

test("events: search covers place and tags; filters by project, city and month, the project named as the API names it", () => {
  const X = load();
  const { events } = X.all();
  assert.deepEqual(X.query("events", events, { q: "live-set" }).hits.map((x) => x.id), ["a/denver"]);
  assert.deepEqual(X.query("events", events, { q: "austin" }).hits.map((x) => x.id), ["b/fest"]);
  assert.deepEqual(X.query("events", events, { city: ["Denver", "Austin"], project: ["b"] }).hits.map((x) => x.id), ["b/fest"]);
  const { facets } = X.query("events", events, {});
  assert.deepEqual(facets.map((f) => f.key), ["project", "city", "month"]);
  assert.ok(facets.find((f) => f.key === "project").values.some((v) => v.label === "Beta Studio"));
  const months = facets.find((f) => f.key === "month").values.map((v) => v.value);
  assert.deepEqual(months, [...months].sort(), "months in date order");
});

test("search and filters: OR within, AND between, counts without their own filter", () => {
  const X = load();
  const { releases } = X.all();
  assert.deepEqual(X.query("releases", releases, { q: "stitched" }).hits.map((r) => r.id), ["r2"], "searches the description");
  assert.deepEqual(X.query("releases", releases, { q: "alpha" }).hits.map((r) => r.id), ["r1"], "and the project's name");
  assert.deepEqual(X.query("releases", releases, { type: ["Single", "EP"] }).hits.length, 2);
  assert.deepEqual(X.query("releases", releases, { type: ["EP"], project: ["a"] }).hits, []);
  const { facets } = X.query("releases", releases, { type: ["EP"] });
  const type = facets.find((f) => f.key === "type");
  assert.deepEqual(type.values.map((v) => [v.value, v.count, v.selected]).sort(), [["EP", 1, true], ["Single", 1, false]]);
  assert.deepEqual(facets.find((f) => f.key === "project").values.map((v) => [v.label, v.count]), [["Beta", 1]]);
});

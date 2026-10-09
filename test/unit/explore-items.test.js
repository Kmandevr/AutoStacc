// The /explore items (js/explore-items.js): real data only (drafts and past shows never appear), newest first (shows
// soonest first), search across title, project and text, filters OR within and AND between, and each filter's counts
// worked out without itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const source = fs.readFileSync(path.resolve(import.meta.dirname, "../../js/explore-items.js"), "utf8");
const future = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

function load() {
  const window = {
    PROJECTS: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }, { id: "d", name: "Hidden", draft: true }],
    MUSIC: { releases: [
      { id: "r1", project: "a", type: "Single", date: "2025-10-15", title: "Hail", tracks: [{}] },
      { id: "r2", project: "b", type: "EP", date: "2026-02-01", title: "Thread", description: "Stitched loops" },
      { id: "r3", project: "a", type: "Album", date: "2026-03-01", title: "Secret", draft: true },
      { id: "r4", project: "d", type: "Single", date: "2026-04-01", title: "Of a draft project" },
      { id: "r5", project: "nobody", type: "Single", date: "2026-04-01", title: "Of no project" }
    ] },
    NEWS: [{ id: "n1", project: "a", date: "2025-10-15", title: "Out now", tag: "Release", summary: "Hail is out" },
      { id: "n2", project: "b", date: "2026-01-01", title: "Draft", tag: "Tour", draft: true }],
    SHOWS: [{ project: "a", date: future(10), city: "Denver", venue: "Hall" }, { project: "a", date: "2020-01-01", city: "Old", venue: "Gone" },
      { project: "b", date: future(5), city: "Austin", venue: "Patchbay", draft: true }],
    GS: { projectPath: (id, ...rest) => ["", "c", id, ...rest].join("/") }
  };
  vm.runInNewContext(source, { window, Date, Math });
  // Arrays made inside the vm aren't this realm's; compare plain copies.
  const X = window.GS.exploreItems, plain = (f) => (...a) => JSON.parse(JSON.stringify(f(...a)));
  return { all: plain(X.all), query: plain(X.query) };
}

test("drafts, draft projects' items and past shows never appear; newest first; links go to the project's own pages", () => {
  const X = load();
  const all = X.all();
  assert.deepEqual(all.releases.map((r) => r.id), ["r1", "r2"]);
  assert.deepEqual(all.news.map((n) => n.id), ["n1"]);
  assert.deepEqual(all.shows.map((s) => s.city), ["Denver"]);
  assert.equal(all.releases[0].href, "/c/a/music/r1");
  assert.equal(all.news[0].href, "/c/a/news/n1");
  assert.deepEqual(X.query("releases", all.releases, {}).hits.map((r) => r.id), ["r2", "r1"]);
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

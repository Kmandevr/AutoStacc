// Pack Builder revisions that upload only what changed (docs/packs.md, Phase 6): the store says which files a creator
// already has (their own only), a thin ZIP plus a carry list makes the same version as the whole archive would, and
// the carry list can't be used to get anything past the checks: unsafe paths, hashes the creator doesn't have, another
// creator's files, or a type the bytes were never checked as.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { newBuyer } from "../support/flows.js";
import * as P from "../support/packs.js";

const { S, caseZip, expected, create, build } = P;
const files = (name) => expected(name).files.filter((f) => f.sha256 && !f.ignored);

export default (ctx) => describe("pack revisions", () => {
  const base = () => ctx.mock.url;

  // A creator whose product's live version is pack-basic.
  async function withLivePack(tag) {
    const who = await P.creatorWithProducts(base(), tag);
    const { version } = await build(who.c, who.products[0].id, caseZip("pack-basic"));
    assert.equal((await who.c.post(`${S}/versions/${version.id}/publish`, {})).status, 200);
    return { ...who, product: who.products[0], live: version };
  }
  const have = (c, productId, hashes) => c.post(`${S}/products/${productId}/have`, { hashes });
  // The files of pack-revision the store has from pack-basic, as the browser would list them.
  const carryOf = (known) => files("pack-revision").filter((f) => known.includes(f.sha256)).map((f) => ({ path: f.path, sha256: f.sha256 }));

  test("a thin ZIP plus what the store already has makes the same version as the whole archive", async () => {
    const { c, product } = await withLivePack("rv-thin");
    const hashes = files("pack-revision").map((f) => f.sha256);
    const known = (await have(c, product.id, [...hashes, "f".repeat(64)])).data.known;
    assert.deepEqual(known.sort(), files("pack-basic").map((f) => f.sha256).filter((h) => hashes.includes(h)).sort());
    const carry = carryOf(known);
    assert.equal(carry.length, 5);

    const { version } = await build(c, product.id, caseZip("pack-revision-thin"), { carry });
    assert.equal(version.status, "ready", JSON.stringify(version));
    assert.equal(version.stats.files, 7);
    assert.equal(version.stats.carried, 5);
    assert.deepEqual(version.stats.diff.counts, { same: 4, moved: 1, replaced: 1, added: 1, removed: 1 });
    assert.equal(version.stats.review.verdict, "pass", "a revision's unchanged files aren't duplicates");
    const air = version.files.find((f) => f.filename === "Air.aif");
    assert.deepEqual([air.folderPath, air.change, air.format], ["Ambience", "moved", "aiff"]);
    assert.equal((await c.post(`${S}/versions/${version.id}/publish`, {})).status, 200);
  });

  test("a revision that only moves files uploads an empty archive", async () => {
    const { c, product, live } = await withLivePack("rv-empty");
    // Every file of the live version, two of them in a new folder.
    const carry = live.files.map((f) => ({ path: `Pack/${f.filename.endsWith(".wav") ? "Audio" : f.folderPath}/${f.filename}`, sha256: f.sha256 }));
    const { version } = await build(c, product.id, caseZip("empty"), { carry });
    assert.equal(version.status, "ready", JSON.stringify(version));
    assert.equal(version.stats.files, live.files.length);
    assert.equal(version.stats.diff.counts.moved, 2);
    assert.equal(version.stats.diff.counts.removed, 0);
    assert.equal(version.stats.review.verdict, "pass");
  });

  test("the carry list gets nothing past the checks", async () => {
    const { c, product, live } = await withLivePack("rv-attack");
    const kick = live.files.find((f) => f.filename === "Kick 01.wav");
    const readme = live.files.find((f) => f.filename === "Read me.txt");
    const discard = (v) => c.post(`${S}/versions/${v.id}/discard`, {});

    // Unsafe paths are refused with the engine's own codes, and hold the version.
    let { version } = await build(c, product.id, caseZip("empty"), { carry: [{ path: "../escape.wav", sha256: kick.sha256 }, { path: "Drums/CON.wav", sha256: kick.sha256 }] });
    assert.deepEqual(version.stats.refused.map((r) => r.codes[0]).sort(), ["path_traversal", "reserved_name"]);
    assert.ok(version.stats.review.flags.some((f) => f.code === "unsafe_entries" && f.hard));
    await discard(version);

    // A type the bytes were never checked as: refused like a deceptive file.
    ({ version } = await build(c, product.id, caseZip("empty"), { carry: [{ path: "Kick.txt", sha256: kick.sha256 }, { path: "Install.bat", sha256: readme.sha256 }] }));
    assert.deepEqual(version.stats.refused.map((r) => r.codes[0]), ["content_does_not_match_name", "content_does_not_match_name"]);
    assert.ok(version.stats.review.flags.some((f) => f.code === "deceptive_files"));
    assert.equal(version.stats.files, 0);
    await discard(version);

    // A hash this creator doesn't have fails the version: the browser must send that file.
    ({ version } = await build(c, product.id, caseZip("empty"), { carry: [{ path: "Kick.wav", sha256: "a".repeat(64) }] }));
    assert.deepEqual([version.status, version.note], ["failed", "missing_files"]);

    // Another creator's files aren't this creator's to carry, and the store won't say whether it has them.
    const other = await P.creatorWithProducts(base(), "rv-other");
    assert.deepEqual((await have(other.c, other.products[0].id, [kick.sha256])).data.known, []);
    assert.equal((await have(other.c, product.id, [kick.sha256])).status, 404);
    const { c: buyer } = await newBuyer(base(), "rv-buyer");
    assert.equal((await have(buyer, product.id, [kick.sha256])).status, 404);
    ({ version } = await build(other.c, other.products[0].id, caseZip("empty"), { carry: [{ path: "Kick 01.wav", sha256: kick.sha256 }] }));
    assert.deepEqual([version.status, version.note], ["failed", "missing_files"]);

    // Malformed lists are refused up front.
    for (const carry of ["x", [{ path: "a.wav", sha256: "nope" }], [{ path: "", sha256: kick.sha256 }], Array(2001).fill({ path: "a.wav", sha256: kick.sha256 })]) {
      assert.equal((await create(c, product.id, caseZip("empty"), { carry })).status, 400);
    }
    assert.equal((await have(c, product.id, ["nope"])).status, 400);
  });
});

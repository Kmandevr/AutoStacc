// Your Stacc's collections, tags and saved searches (server/collections/; docs/packs.md Phase 6b): signed-in people
// only, each person's own only (another's collection is 404, another's file id is 404), never a file they don't own,
// files that stop being theirs are counted but not listed, creators' metadata is untouched, and the data export and
// account deletion cover all of it.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql } from "../support/client.js";
import { newBuyer, mockBuy } from "../support/flows.js";

export default (ctx) => describe("collections", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);

  async function owner(tag) {
    const who = await newBuyer(base(), tag);
    await mockBuy(who.c, [{ productId: "serum-presets" }, { productId: "wallpapers" }]);
    const items = (await who.c.get("/api/library")).data.items;
    const files = items.flatMap((p) => p.files);
    assert.ok(files.length >= 2);
    return { ...who, files, keyOf: (f) => f.assetId || f.id };
  }

  test("signed-out people get 401; a person's collections, tags and searches are theirs alone", async () => {
    const anon = new Client(base());
    assert.equal((await anon.get("/api/collections")).status, 401);
    assert.equal((await anon.post("/api/collections", { name: "X" })).status, 401);
    const a = await owner("coll-a");
    const b = await owner("coll-b");

    const made = await a.c.post("/api/collections", { name: "Late night" });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    const cid = made.data.collection.id;
    assert.equal((await a.c.post("/api/collections", { name: "late NIGHT" })).status, 409, "names are unique per person, ignoring case");
    assert.equal((await b.c.post("/api/collections", { name: "Late night" })).status, 201, "another person may use the same name");
    const two = a.files.slice(0, 2).map((f) => f.id);
    assert.equal((await a.c.post(`/api/collections/${cid}/items`, { fileIds: two })).data.count, 2);
    assert.equal((await a.c.post(`/api/collections/${cid}/items`, { fileIds: two })).data.count, 2, "adding twice keeps one");
    assert.equal((await a.c.post("/api/tags", { fileIds: [two[0]], tag: "  Dark Pads " })).data.tag, "dark pads");
    assert.equal((await a.c.post("/api/saved-searches", { name: "Pads", query: "?q=pad&kind=presets" })).status, 201);

    const mine = (await a.c.get("/api/collections")).data;
    const col = mine.collections.find((c) => c.id === cid);
    assert.deepEqual(col.items.sort(), a.files.slice(0, 2).map(a.keyOf).sort());
    assert.deepEqual(mine.tags[a.keyOf(a.files[0])], ["dark pads"]);
    assert.deepEqual(mine.searches.map((s) => s.query), ["q=pad&kind=presets"]);

    // b sees none of it and can't touch it, nor use a's files.
    const theirs = (await b.c.get("/api/collections")).data;
    assert.ok(!theirs.collections.some((c) => c.id === cid));
    assert.deepEqual(theirs.tags, {});
    assert.equal((await b.c.req("PATCH", `/api/collections/${cid}`, { body: { name: "Mine" } })).status, 404);
    assert.equal((await b.c.req("DELETE", `/api/collections/${cid}`)).status, 404);
    assert.equal((await b.c.post(`/api/collections/${cid}/items`, { fileIds: [b.files[0].id] })).status, 404);
    assert.equal((await b.c.req("DELETE", `/api/saved-searches/${mine.searches[0].id}`)).status, 200, "deleting what isn't yours does nothing");
    assert.equal((await a.c.get("/api/collections")).data.searches.length, 1);
    const bcol = theirs.collections[0].id;
    // A file only a owns.
    await mockBuy(a.c, [{ productId: "stems-patchwork" }]);
    const onlyA = (await a.c.get("/api/library")).data.items.find((p) => p.productId === "stems-patchwork").files[0];
    assert.equal((await b.c.post(`/api/collections/${bcol}/items`, { fileIds: [onlyA.id] })).status, 404);
    assert.equal((await b.c.post("/api/tags", { fileIds: [onlyA.id], tag: "stolen" })).status, 404);
    assert.equal((await b.c.post(`/api/collections/${bcol}/items`, { fileIds: ["pf_doesnotexist"] })).status, 404);
  });

  test("bad input is refused; creators' metadata is untouched", async () => {
    const a = await owner("coll-input");
    const cid = (await a.c.post("/api/collections", { name: "Kicks" })).data.collection.id;
    for (const name of ["", "x".repeat(61), "<b>", 7]) assert.equal((await a.c.post("/api/collections", { name })).status, 400, String(name));
    for (const tag of ["", "x".repeat(31), "-dash", "a<b"]) assert.equal((await a.c.post("/api/tags", { fileIds: [a.files[0].id], tag })).status, 400, tag);
    for (const query of ["", "?", "admin=1", "q=" + "x".repeat(81), "q=a&q=b"]) assert.equal((await a.c.post("/api/saved-searches", { name: "S", query })).status, 400, query);
    for (const fileIds of [[], "pf_x", [1], Array(2001).fill(a.files[0].id)]) assert.equal((await a.c.post(`/api/collections/${cid}/items`, { fileIds })).status, 400);
    const before = db("SELECT COUNT(*) AS n FROM asset_values")[0].n;
    const meta = db(`SELECT filename, kind, meta FROM product_files WHERE id = '${a.files[0].id}'`)[0];
    await a.c.post("/api/tags", { fileIds: [a.files[0].id], tag: "mine" });
    assert.equal(db("SELECT COUNT(*) AS n FROM asset_values")[0].n, before);
    assert.deepEqual(db(`SELECT filename, kind, meta FROM product_files WHERE id = '${a.files[0].id}'`)[0], meta);
    assert.equal((await a.c.post("/api/tags/remove", { fileIds: [a.files[0].id], tag: "mine" })).status, 200);
    // The tag cap holds even for one request with many files: 4,999 rows, then two files tagged at once.
    db(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 4999)
      INSERT INTO asset_tags (user_id, item_key, tag, created_at) SELECT '${a.user.id}', 'as_fake' || i, 'x', '2026-01-01' FROM n`);
    await a.c.post("/api/tags", { fileIds: a.files.slice(0, 2).map((f) => f.id), tag: "over" });
    assert.equal(db(`SELECT COUNT(*) AS n FROM asset_tags WHERE user_id = '${a.user.id}'`)[0].n, 5000);
    db(`DELETE FROM asset_tags WHERE user_id = '${a.user.id}'`);
    assert.deepEqual((await a.c.get("/api/collections")).data.tags, {});
  });

  test("files that stop being yours are counted, not listed, and can be cleared", async () => {
    const a = await owner("coll-gone");
    const cid = (await a.c.post("/api/collections", { name: "All" })).data.collection.id;
    await a.c.post(`/api/collections/${cid}/items`, { fileIds: a.files.map((f) => f.id) });
    await a.c.post("/api/tags", { fileIds: a.files.map((f) => f.id), tag: "keep" });
    // Access to one product ends (as a refund would).
    db(`UPDATE entitlements SET status = 'revoked', revoked_at = '2026-01-01T00:00:00.000Z' WHERE user_id = '${a.user.id}' AND product_id = 'wallpapers'`);
    const gone = (await a.c.get("/api/library")).data.items.find((p) => p.productId === "wallpapers");
    assert.equal(gone, undefined);
    const view = (await a.c.get("/api/collections")).data;
    const col = view.collections.find((c) => c.id === cid);
    const lost = a.files.length - col.items.length;
    assert.ok(lost > 0 && col.missing === lost, "the files no longer yours are counted");
    assert.ok(Object.keys(view.tags).length === col.items.length, "and their tags aren't listed");
    assert.equal((await a.c.post(`/api/collections/${cid}/items/remove`, { missing: true })).status, 200);
    assert.equal((await a.c.get("/api/collections")).data.collections.find((c) => c.id === cid).missing, 0);
  });

  test("the data export includes them and deleting the account erases them", async () => {
    const a = await owner("coll-export");
    const cid = (await a.c.post("/api/collections", { name: "Export me" })).data.collection.id;
    await a.c.post(`/api/collections/${cid}/items`, { fileIds: [a.files[0].id] });
    await a.c.post("/api/tags", { fileIds: [a.files[0].id], tag: "exported" });
    await a.c.post("/api/saved-searches", { name: "Mine", query: "kind=presets" });
    const data = (await a.c.post("/api/account/export", {})).data;
    assert.deepEqual(data.collections.map((c) => [c.name, c.items.length]), [["Export me", 1]]);
    assert.deepEqual(data.tags.map((t) => t.tag), ["exported"]);
    assert.deepEqual(data.savedSearches.map((s) => s.query), ["kind=presets"]);
    assert.equal((await a.c.post("/api/account/delete", { confirm: a.user.email, password: "correct-horse-battery" })).status, 200);
    for (const t of ["collections", "asset_tags", "saved_searches"]) assert.equal(db(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = '${a.user.id}'`)[0].n, 0, t);
    assert.equal(db(`SELECT COUNT(*) AS n FROM collection_items WHERE collection_id = '${cid}'`)[0].n, 0);
  });
});

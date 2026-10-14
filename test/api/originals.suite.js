// A creator's own originals back out (server/packs/originals.js; docs/vision.md §10): a checked version's files one at a
// time or as a ZIP in their folders, byte for byte; nobody else's, and nothing before the version is checked.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Client } from "../support/client.js";
import { entries as zipEntries } from "../mock-engine/server.js";
import * as P from "../support/packs.js";

const { S, caseZip, build, expected } = P;
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

export default (ctx) => describe("packs: creators' originals", () => {
  const base = () => ctx.mock.url;

  test("a version's originals download whole or one by one, only for the creator", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "or-own");
    const { version } = await build(c, products[0].id, caseZip("pack-basic"));
    assert.equal(version.status, "ready");
    const want = new Map(expected("pack-basic").files.filter((f) => f.sha256).map((f) => [f.path.split("/").slice(1).join("/"), f.sha256]));
    const get = (who, path) => fetch(base() + path, { headers: { Cookie: who.cookieHeader(), "cf-connecting-ip": who.ip } });
    const res = await get(c, `${S}/versions/${version.id}/download`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-disposition"), /attachment/);
    const zip = Buffer.from(await res.arrayBuffer());
    assert.equal(Number(res.headers.get("content-length")), zip.length);
    const inside = zipEntries(zip);
    assert.equal(inside.size, version.files.length);
    for (const [name, read] of inside) assert.equal(sha(read()), want.get(name), `${name} byte for byte, in its folder`);
    const kick = version.files.find((f) => f.filename === "Kick 01.wav");
    const one = await get(c, `${S}/versions/${version.id}/files/${kick.assetId}`);
    assert.equal(one.status, 200);
    assert.equal(sha(Buffer.from(await one.arrayBuffer())), kick.sha256);
    // Nobody else: another creator, a stranger, a made-up file.
    const other = await P.creatorWithProducts(base(), "or-other");
    assert.equal((await get(other.c, `${S}/versions/${version.id}/download`)).status, 404);
    assert.equal((await get(new Client(base()), `${S}/versions/${version.id}/files/${kick.assetId}`)).status, 401);
    assert.equal((await get(c, `${S}/versions/${version.id}/files/as_nosuchfile`)).status, 404);
  });
});
